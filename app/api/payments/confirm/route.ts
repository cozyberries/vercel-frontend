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

        // Create payment record (relies on DB unique constraint on order_id to prevent duplicates)
        const paymentReference = `upi_manual_${crypto.randomUUID()}`;
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

        if (paymentInsertError) {
            // Unique constraint violation — duplicate payment for this order
            if (paymentInsertError.code === "23505") {
                return NextResponse.json(
                    { error: "Payment already exists for this order" },
                    { status: 409 }
                );
            }
            console.error("Payment insert error:", paymentInsertError);
            return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
        }

        if (!insertedPayment) {
            return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
        }

        // Update order status to processing.
        // NOTE: payment insert + order update are not wrapped in a DB transaction.
        // If the update fails, the compensating rollback below deletes the payment.
        // A Supabase RPC wrapping both in a single transaction would be more robust.
        const { data: updatedRows, error: orderUpdateError } = await supabase
            .from("orders")
            .update({ status: "processing" })
            .eq("id", orderId)
            .eq("status", "payment_pending")
            .select("id");

        if (orderUpdateError || !updatedRows || updatedRows.length !== 1) {
            // Rollback: remove the orphaned payment record in all failure paths
            const { error: rollbackError } = await supabase
                .from("payments")
                .delete()
                .eq("id", insertedPayment.id);
            if (rollbackError) {
                console.error("Payment rollback failed:", rollbackError);
            }

            if (orderUpdateError) {
                console.error("Order update error:", orderUpdateError);
                return NextResponse.json(
                    { error: "Failed to update order status. Please try again." },
                    { status: 500 }
                );
            }

            // No DB error but 0 rows affected — concurrent confirmation race
            console.error("Order update affected 0 rows — likely a concurrent payment confirmation", { orderId });
            return NextResponse.json(
                { error: "Payment already confirmed for this order" },
                { status: 409 }
            );
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Payment Confirmation Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
