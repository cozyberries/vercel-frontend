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

        let body: { orderId?: unknown };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
        }
        orderId = body.orderId as string | undefined;
        const trimmedOrderId = (typeof orderId === "string" ? orderId.trim() : "");
        if (trimmedOrderId.length === 0) {
            return NextResponse.json({ error: "Order ID is required" }, { status: 400 });
        }

        // Fetch order to get the correct amount
        const { data: order, error: orderError } = await supabase
            .from("orders")
            .select("id, total_amount, currency")
            .eq("id", trimmedOrderId)
            .eq("user_id", user.id)
            .single();

        if (orderError || !order) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        const totalAmount = order.total_amount;
        if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
            return NextResponse.json(
                { error: "Invalid total_amount: must be a finite positive number" },
                { status: 400 }
            );
        }
        const amount = Math.round(totalAmount * 100); // Amount in smallest currency unit (paise)
        const currency = order.currency || "INR";

        const options = {
            amount: amount,
            currency: currency,
            receipt: trimmedOrderId,
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
