import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
    try {
        const supabase = await createServerSupabaseClient();

        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            orderId
        } = body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
            return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
        }

        // Verify Signature
        const secret = process.env.RAZORPAY_KEY_SECRET!;
        const bodyStr = razorpay_order_id + "|" + razorpay_payment_id;

        const expectedSignature = crypto
            .createHmac("sha256", secret)
            .update(bodyStr.toString())
            .digest("hex");

        const isAuthentic = expectedSignature === razorpay_signature;

        if (!isAuthentic) {
            return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
        }

        // Payment is valid.
        // 1. Get Order to check amount and verify ownership
        const { data: order, error: orderFetchError } = await supabase
            .from("orders")
            .select("*")
            .eq("id", orderId)
            .eq("user_id", user.id)
            .single();

        if (orderFetchError || !order) {
            return NextResponse.json({ error: "Order not found or unauthorized" }, { status: 404 });
        }

        // 2. Create Payment Record
        const paymentData = {
            order_id: orderId,
            user_id: user.id,
            payment_reference: razorpay_payment_id,
            // Note: Razorpay doesn't provide payment method in webhook response.
            // To get actual method (card/upi/netbanking), we'd need to fetch from Razorpay API.
            // Using 'upi' as default for now.
            payment_method: "upi",
            gateway_provider: "razorpay",
            amount: order.total_amount,
            currency: "INR",
            gateway_response: {
                razorpay_order_id,
                razorpay_payment_id,
                razorpay_signature
            },
            status: "completed"
        };

        const { error: paymentInsertError } = await supabase
            .from("payments")
            .insert(paymentData);

        if (paymentInsertError) {
            console.error("Payment insert error", paymentInsertError);
            return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
        }

        // 3. Update Order Status
        const { error: orderUpdateError } = await supabase
            .from("orders")
            .update({ status: "payment_confirmed" })
            // or 'processing', depending on business logic. 'payment_confirmed' seems appropriate.
            .eq("id", orderId);

        if (orderUpdateError) {
            console.error("Order update error", orderUpdateError);
            // Payment recorded but order not updated.
            return NextResponse.json({ error: "Payment recorded but order status update failed" }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Payment Verification Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
