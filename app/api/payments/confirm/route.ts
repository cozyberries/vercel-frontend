import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
    try {
        const supabase = await createServerSupabaseClient();

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        let body: { orderId?: string };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
        }

        const orderId = body.orderId?.trim();
        if (!orderId) {
            return NextResponse.json({ error: "Order ID is required" }, { status: 400 });
        }

        // Fetch order and verify ownership
        const { data: order, error: orderError } = await supabase
            .from("orders")
            .select("*")
            .eq("id", orderId)
            .eq("user_id", user.id)
            .single();

        if (orderError || !order) {
            return NextResponse.json({ error: "Order not found or unauthorized" }, { status: 404 });
        }

        if (order.status !== "payment_pending") {
            return NextResponse.json(
                { error: "Payment already confirmed for this order" },
                { status: 409 }
            );
        }

        // Check for existing payment to prevent duplicates
        const { data: existingPayment } = await supabase
            .from("payments")
            .select("id")
            .eq("order_id", orderId)
            .limit(1)
            .single();

        if (existingPayment) {
            return NextResponse.json(
                { error: "Payment already exists for this order" },
                { status: 409 }
            );
        }

        // Create payment record
        const paymentReference = `upi_manual_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const paymentData = {
            order_id: orderId,
            user_id: user.id,
            payment_reference: paymentReference,
            payment_method: "upi",
            gateway_provider: "manual",
            amount: order.total_amount,
            currency: "INR",
            gateway_response: {
                method: "upi_qr_or_link",
                confirmed_by_user: true,
                confirmed_at: new Date().toISOString(),
            },
            status: "processing",
        };

        const { data: insertedPayment, error: paymentInsertError } = await supabase
            .from("payments")
            .insert(paymentData)
            .select("id")
            .single();

        if (paymentInsertError || !insertedPayment) {
            console.error("Payment insert error:", paymentInsertError);
            return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
        }

        // Update order status to processing
        const { error: orderUpdateError } = await supabase
            .from("orders")
            .update({ status: "processing" })
            .eq("id", orderId);

        if (orderUpdateError) {
            console.error("Order update error:", orderUpdateError);
            // Rollback: remove the orphaned payment record
            const { error: rollbackError } = await supabase
                .from("payments")
                .delete()
                .eq("id", insertedPayment.id);
            if (rollbackError) {
                console.error("Payment rollback failed:", rollbackError);
            }
            return NextResponse.json(
                { error: "Failed to confirm payment. Please try again." },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Payment Confirmation Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
