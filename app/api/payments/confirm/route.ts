import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isSessionExpired } from "@/lib/utils/checkout-helpers";
import { logServerEvent } from "@/lib/services/event-logger";
import { notifyPaymentConfirmed } from "@/lib/services/telegram";

// Schema for validating cart items
const OrderItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  price: z.number().positive(),
  quantity: z.number().int().positive(),
  image: z.string().optional().nullable(),
  size: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
});

const OrderItemsSchema = z.array(OrderItemSchema);

export async function POST(request: NextRequest) {
    try {
        const supabase = await createServerSupabaseClient();

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        let body: { orderId?: string; sessionId?: string };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
        }

        const sessionId = body.sessionId?.trim() ?? "";
        const orderId = body.orderId?.trim() ?? "";

        if (sessionId.length > 0) {
            return handleSessionConfirm(supabase, user, sessionId);
        }

        if (orderId.length > 0) {
            return handleOrderConfirm(supabase, user, orderId);
        }

        return NextResponse.json({ error: "sessionId or orderId is required" }, { status: 400 });

    } catch (error) {
        console.error("Payment Confirmation Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// ─── Helper: Restore session status when error occurs ────────────────────────

async function restoreSessionStatus(
    supabase: ReturnType<typeof createServerSupabaseClient> extends Promise<infer T> ? T : never,
    sessionId: string,
    fromStatus: string,
    toStatus: string
) {
    const { error: restoreError, data: updatedRows } = await supabase
        .from("checkout_sessions")
        .update({ status: toStatus })
        .eq("id", sessionId)
        .eq("status", fromStatus)
        .select("id");

    if (restoreError || !updatedRows?.length) {
        console.error("Failed to restore session status:", {
            restoreError,
            sessionId,
            fromStatus,
            toStatus,
            affectedRows: updatedRows?.length ?? 0,
        });
        return false;
    }
    return true;
}

// ─── Helper: Rollback order and related records ────────────────────────────────

async function rollbackOrder(
    supabase: ReturnType<typeof createServerSupabaseClient> extends Promise<infer T> ? T : never,
    orderId: string,
    paymentId?: string
) {
    const { error: itemsDeleteError } = await supabase
        .from("order_items")
        .delete()
        .eq("order_id", orderId);
    if (itemsDeleteError) {
        console.error("Rollback: Failed to delete order_items:", {
            itemsDeleteError,
            orderId,
        });
    }

    const { error: orderDeleteError } = await supabase
        .from("orders")
        .delete()
        .eq("id", orderId);
    if (orderDeleteError) {
        console.error("Rollback: Failed to delete order:", {
            orderDeleteError,
            orderId,
        });
    }

    if (paymentId) {
        const { error: paymentDeleteError } = await supabase
            .from("payments")
            .delete()
            .eq("id", paymentId);
        if (paymentDeleteError) {
            console.error("Rollback: Failed to delete payment — orphaned payment may require manual cleanup:", {
                paymentDeleteError,
                paymentId,
            });
        }
    }
}

// ─── New flow: session-based confirmation ─────────────────────────────────────

async function handleSessionConfirm(
    supabase: ReturnType<typeof createServerSupabaseClient> extends Promise<infer T> ? T : never,
    user: { id: string; email?: string },
    sessionId: string
) {
    // 1. Load session and verify ownership + status
    const { data: session, error: sessionError } = await supabase
        .from("checkout_sessions")
        .select("*")
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .single();

    if (sessionError || !session) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.status === "completed") {
        return NextResponse.json({
            error: "Payment already confirmed",
            order_id: session.order_id,
        }, { status: 409 });
    }

    if (session.status === "processing") {
        return NextResponse.json(
            { error: "Session is currently being processed. Please retry shortly." },
            { status: 409 }
        );
    }

    if (session.status !== "pending" || isSessionExpired(session.created_at)) {
        return NextResponse.json(
            { error: "Session has expired. Please checkout again." },
            { status: 410 }
        );
    }

    // 2. Atomically reserve session by transitioning pending → processing (prevents TOCTOU race)
    const { data: reservedSessionRows, error: reserveError } = await supabase
        .from("checkout_sessions")
        .update({ status: "processing" })
        .eq("id", sessionId)
        .eq("status", "pending")
        .select("id");

    if (reserveError || !reservedSessionRows?.length) {
        return NextResponse.json(
            { error: "Session is being processed by another request. Please try again." },
            { status: 409 }
        );
    }

    // 3. Validate session items BEFORE creating order (prevent orphaned orders)
    const itemsValidation = OrderItemsSchema.safeParse(session.items);
    if (!itemsValidation.success) {
        console.error("Invalid session items format:", itemsValidation.error);
        // Restore session to pending since validation failed
        await restoreSessionStatus(supabase, sessionId, "processing", "pending");
        return NextResponse.json(
            { error: "Invalid order items in session" },
            { status: 400 }
        );
    }

    const items = itemsValidation.data;

    // 4. Create order from session data
    const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
            user_id: user.id,
            customer_email: session.customer_email,
            customer_phone: session.customer_phone,
            shipping_address: session.shipping_address,
            billing_address: session.billing_address,
            subtotal: session.subtotal,
            delivery_charge: session.delivery_charge,
            tax_amount: session.tax_amount,
            total_amount: session.total_amount,
            currency: session.currency,
            notes: session.notes,
            status: "verifying_payment",
        })
        .select("id, order_number")
        .single();

    if (orderError || !order) {
        console.error("Error creating order from session:", orderError);
        await restoreSessionStatus(supabase, sessionId, "processing", "pending");
        return NextResponse.json(
            { error: "Failed to create order" },
            { status: 500 }
        );
    }

    // 5. Create order items from session items
    const itemRows = items.map((item) => ({
        order_id: order.id,
        product_id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        image: item.image ?? null,
        size: item.size ?? null,
        color: item.color ?? null,
        sku: item.sku ?? null,
    }));

    const { error: itemsError } = await supabase
        .from("order_items")
        .insert(itemRows);

    if (itemsError) {
        console.error("Error inserting order items:", itemsError);
        await rollbackOrder(supabase, order.id);
        await restoreSessionStatus(supabase, sessionId, "processing", "pending");
        return NextResponse.json(
            { error: "Failed to save order items" },
            { status: 500 }
        );
    }

    // 6. Create payment record
    const paymentReference = `upi_manual_${crypto.randomUUID()}`;
    const { data: insertedPayment, error: paymentInsertError } = await supabase
        .from("payments")
        .insert({
            order_id: order.id,
            user_id: user.id,
            payment_reference: paymentReference,
            payment_method: "upi",
            gateway_provider: "manual",
            amount: session.total_amount,
            currency: session.currency ?? "INR",
            gateway_response: {
                method: "upi_qr_or_link",
                confirmed_by_user: true,
                confirmed_at: new Date().toISOString(),
                checkout_session_id: sessionId,
            },
            status: "processing",
        })
        .select("id")
        .single();

    if (paymentInsertError || !insertedPayment) {
        console.error("Payment insert error:", paymentInsertError);
        await rollbackOrder(supabase, order.id);
        await restoreSessionStatus(supabase, sessionId, "processing", "pending");
        return NextResponse.json(
            { error: "Failed to record payment" },
            { status: 500 }
        );
    }

    // 7. Mark session as completed (transition processing → completed)
    // Note: updated_at is auto-set by the DB trigger on UPDATE
    const { data: updatedSessionRows, error: sessionUpdateError } = await supabase
        .from("checkout_sessions")
        .update({
            status: "completed",
            order_id: order.id,
        })
        .eq("id", sessionId)
        .eq("status", "processing")
        .select("id");

    if (sessionUpdateError || !updatedSessionRows?.length) {
        console.error("Session update failed — rolled back order:", sessionUpdateError ?? "no rows updated");
        await rollbackOrder(supabase, order.id, insertedPayment.id);
        await restoreSessionStatus(supabase, sessionId, "processing", "pending");
        return NextResponse.json(
            { error: "Failed to complete checkout. Please try again." },
            { status: 500 }
        );
    }

    // 8. Log events (fire-and-forget)
    logServerEvent(supabase, user.id, "order_created", {
        order_id: order.id,
        order_number: order.order_number,
        session_id: sessionId,
        total_amount: session.total_amount,
    });
    logServerEvent(supabase, user.id, "payment_confirmed", {
        order_id: order.id,
        payment_ref: paymentReference,
    });
    notifyPaymentConfirmed({
        orderNumber: order.order_number,
        totalAmount: session.total_amount,
        orderStatus: "verifying_payment",
        paymentStatus: "processing",
        email: session.customer_email ?? null,
        phone: session.customer_phone ?? null,
    });

    return NextResponse.json({
        success: true,
        order_id: order.id,
        order_number: order.order_number,
    });
}

// ─── Legacy flow: order-based confirmation ────────────────────────────────────

async function handleOrderConfirm(
    supabase: ReturnType<typeof createServerSupabaseClient> extends Promise<infer T> ? T : never,
    user: { id: string; email?: string },
    orderId: string
) {
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

    // Create payment record
    const paymentReference = `upi_manual_${crypto.randomUUID()}`;
    const paymentData = {
        order_id: orderId,
        user_id: user.id,
        payment_reference: paymentReference,
        payment_method: "upi",
        gateway_provider: "manual",
        amount: order.total_amount,
        currency: order.currency ?? "INR",
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

    // Update order status to verifying_payment
    const { data: updatedRows, error: orderUpdateError } = await supabase
        .from("orders")
        .update({ status: "verifying_payment" })
        .eq("id", orderId)
        .eq("status", "payment_pending")
        .select("id");

    if (orderUpdateError || !updatedRows || updatedRows.length !== 1) {
        // Rollback: remove the orphaned payment record
        const { error: rollbackError } = await supabase
            .from("payments")
            .delete()
            .eq("id", insertedPayment.id);
        if (rollbackError) {
            console.error("Payment rollback failed — orphaned payment may require manual cleanup:", {
                rollbackError,
                paymentId: insertedPayment.id,
                orderId,
            });
        }

        if (orderUpdateError) {
            console.error("Order update error:", orderUpdateError);
            return NextResponse.json(
                { error: "Failed to update order status. Please try again." },
                { status: 500 }
            );
        }

        console.error("Order update affected 0 rows — likely a concurrent payment confirmation", { orderId });
        return NextResponse.json(
            { error: "Payment already confirmed for this order" },
            { status: 409 }
        );
    }

    // Log event (fire-and-forget)
    logServerEvent(supabase, user.id, "payment_confirmed", {
        order_id: orderId,
        payment_ref: paymentReference,
        legacy_flow: true,
    });
    notifyPaymentConfirmed({
        orderNumber: order.order_number,
        totalAmount: order.total_amount,
        orderStatus: "verifying_payment",
        paymentStatus: "processing",
        email: user.email ?? null,
        phone: order.customer_phone ?? null,
    });

    return NextResponse.json({ success: true });
}
