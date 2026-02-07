import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createServerSupabaseClient } from "@/lib/supabase-server";

function getRazorpayClient(): Razorpay | null {
    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return null;
    return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export async function POST(request: NextRequest) {
    let orderId: string | undefined;
    try {
        const razorpay = getRazorpayClient();
        if (!razorpay) {
            return NextResponse.json(
                { error: "Razorpay is not configured" },
                { status: 503 }
            );
        }

        const supabase = await createServerSupabaseClient();

        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        orderId = body.orderId;

        if (typeof orderId !== "string" || orderId.trim().length === 0) {
            return NextResponse.json({ error: "Order ID is required" }, { status: 400 });
        }
        orderId = orderId.trim();

        // Fetch order to get the correct amount
        const { data: order, error: orderError } = await supabase
            .from("orders")
            .select("id, total_amount, currency")
            .eq("id", orderId)
            .eq("user_id", user.id)
            .single();

        if (orderError || !order) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        const amount = Math.round(order.total_amount * 100); // Amount in smallest currency unit (paise)
        const currency = order.currency || "INR";

        const options = {
            amount: amount,
            currency: currency,
            receipt: orderId,
        };

        const razorpayOrder = await razorpay.orders.create(options);

        return NextResponse.json({
            id: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        });

    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Razorpay Order Creation Error:", { message, orderId });
        return NextResponse.json(
            { error: "Failed to create Razorpay order" },
            { status: 500 }
        );
    }
}
