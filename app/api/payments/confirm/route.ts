import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";
import { isSessionExpired } from "@/lib/utils/checkout-helpers";
import { logServerEvent } from "@/lib/services/event-logger";
import { notifyPaymentConfirmed, notifyNewOrder } from "@/lib/services/telegram";
import {
  effectiveUserErrorResponse,
  getEffectiveUser,
} from "@/lib/services/effective-user";
import {
  extractRequestMetadata,
  logImpersonationEvent,
} from "@/lib/services/impersonation-audit";
import { sendConversionsEvent } from "@/lib/analytics/conversions-api";

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

interface ConfirmContext {
  client: SupabaseClient;
  userId: string;
  sessionUser: User;
  request: NextRequest;
}

export async function POST(request: NextRequest) {
  try {
    const result = await getEffectiveUser();
    if (!result.ok) {
      return effectiveUserErrorResponse(result);
    }
    const { userId, client, sessionUser } = result;

    let body: { orderId?: string; sessionId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const sessionId = body.sessionId?.trim() ?? "";
    const orderId = body.orderId?.trim() ?? "";

    const ctx: ConfirmContext = { client, userId, sessionUser, request };

    if (sessionId.length > 0) {
      return handleSessionConfirm(ctx, sessionId);
    }

    if (orderId.length > 0) {
      return handleOrderConfirm(ctx, orderId);
    }

    return NextResponse.json({ error: "sessionId or orderId is required" }, { status: 400 });

  } catch (error) {
    console.error("Payment Confirmation Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── Helper: Restore session status when error occurs ────────────────────────

async function restoreSessionStatus(
  client: SupabaseClient,
  sessionId: string,
  fromStatus: string,
  toStatus: string
) {
  const { error: restoreError, data: updatedRows } = await client
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
  client: SupabaseClient,
  orderId: string,
  paymentId?: string
) {
  const { error: itemsDeleteError } = await client
    .from("order_items")
    .delete()
    .eq("order_id", orderId);
  if (itemsDeleteError) {
    console.error("Rollback: Failed to delete order_items:", {
      itemsDeleteError,
      orderId,
    });
  }

  const { error: orderDeleteError } = await client
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
    const { error: paymentDeleteError } = await client
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

async function handleSessionConfirm(ctx: ConfirmContext, sessionId: string) {
  const { client, userId, sessionUser, request } = ctx;

  // 1. Load session and verify ownership + status
  const { data: session, error: sessionError } = await client
    .from("checkout_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
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
  const { data: reservedSessionRows, error: reserveError } = await client
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
    await restoreSessionStatus(client, sessionId, "processing", "pending");
    return NextResponse.json(
      { error: "Invalid order items in session" },
      { status: 400 }
    );
  }

  const items = itemsValidation.data;

  // 4. Create order from session data. Propagate placed_by_admin_id from the
  //    session so the admin-on-behalf attribution survives even if the admin
  //    ended impersonation between session creation and payment confirmation.
  const placedByAdminId: string | null = session.placed_by_admin_id ?? null;

  const { data: order, error: orderError } = await client
    .from("orders")
    .insert({
      user_id: userId,
      customer_email: session.customer_email,
      customer_phone: session.customer_phone,
      shipping_address: session.shipping_address,
      billing_address: session.billing_address,
      subtotal: session.subtotal,
      discount_code: session.discount_code ?? null,
      discount_amount: session.discount_amount ?? 0,
      delivery_charge: session.delivery_charge,
      tax_amount: session.tax_amount,
      total_amount: session.total_amount,
      currency: session.currency,
      notes: session.notes,
      status: "verifying_payment",
      placed_by_admin_id: placedByAdminId,
    })
    .select("id, order_number")
    .single();

  if (orderError || !order) {
    console.error("Error creating order from session:", orderError);
    await restoreSessionStatus(client, sessionId, "processing", "pending");
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

  const { error: itemsError } = await client
    .from("order_items")
    .insert(itemRows);

  if (itemsError) {
    console.error("Error inserting order items:", itemsError);
    await rollbackOrder(client, order.id);
    await restoreSessionStatus(client, sessionId, "processing", "pending");
    return NextResponse.json(
      { error: "Failed to save order items" },
      { status: 500 }
    );
  }

  // 6. Create payment record
  const paymentReference = `upi_manual_${crypto.randomUUID()}`;
  const { data: insertedPayment, error: paymentInsertError } = await client
    .from("payments")
    .insert({
      order_id: order.id,
      user_id: userId,
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
    await rollbackOrder(client, order.id);
    await restoreSessionStatus(client, sessionId, "processing", "pending");
    return NextResponse.json(
      { error: "Failed to record payment" },
      { status: 500 }
    );
  }

  // 7. Mark session as completed (transition processing → completed)
  const { data: updatedSessionRows, error: sessionUpdateError } = await client
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
    await rollbackOrder(client, order.id, insertedPayment.id);
    await restoreSessionStatus(client, sessionId, "processing", "pending");
    return NextResponse.json(
      { error: "Failed to complete checkout. Please try again." },
      { status: 500 }
    );
  }

  // 8. Log events (fire-and-forget)
  logServerEvent(client, userId, "order_created", {
    order_id: order.id,
    order_number: order.order_number,
    session_id: sessionId,
    total_amount: session.total_amount,
  });
  logServerEvent(client, userId, "payment_confirmed", {
    order_id: order.id,
    payment_ref: paymentReference,
  });

  // Audit: if this order was placed under admin impersonation, log the
  // `order_placed` event against the admin actor who created the session.
  // The audit row is still correct even if the customer (not the admin)
  // happens to be the one who pressed "Confirm Payment".
  if (placedByAdminId) {
    const { ip, user_agent } = extractRequestMetadata(request);
    logImpersonationEvent({
      actor_id: placedByAdminId,
      target_id: userId,
      event_type: "order_placed",
      order_id: order.id,
      ip,
      user_agent,
      metadata: {
        order_number: order.order_number,
        session_id: sessionId,
      },
    });
  }

  notifyNewOrder({
    orderId: order.id,
    orderNumber: order.order_number,
    email: session.customer_email,
    phone: session.customer_phone ?? null,
    shippingAddress: session.shipping_address as any,
    totalAmount: session.total_amount,
    subtotal: session.subtotal,
    deliveryCharge: session.delivery_charge ?? 0,
    discountCode: session.discount_code ?? null,
    discountAmount: session.discount_amount ?? 0,
    items: items.map((i) => ({ name: i.name, quantity: i.quantity, size: (i as any).size ?? null })),
  });

  // Fire Purchase server event (fire-and-forget)
  const pixelEventId = crypto.randomUUID();
  const sessionItemIds = Array.isArray(session.items)
    ? (session.items as Array<{ id: string }>).map((i) => i.id).filter(Boolean)
    : [];
  const { ip: sessionClientIp, user_agent: sessionUserAgent } = extractRequestMetadata(request);
  sendConversionsEvent({
    eventName: 'Purchase',
    eventId: pixelEventId,
    eventSourceUrl: `${request.headers.get('origin') ?? ''}/payment/${order.id}`,
    userEmail: sessionUser.email ?? undefined,
    userPhone: sessionUser.phone ?? undefined,
    clientIp: sessionClientIp ?? undefined,
    userAgent: sessionUserAgent ?? undefined,
    customData: {
      value: session.total_amount,
      currency: session.currency ?? 'INR',
      content_ids: sessionItemIds,
      content_type: 'product',
      order_id: order.id,
    },
  }).catch((err) => console.error('[Meta CAPI] Purchase event failed:', err));

  return NextResponse.json({
    success: true,
    order_id: order.id,
    order_number: order.order_number,
    pixel_event_id: pixelEventId,
  });
}

// ─── Legacy flow: order-based confirmation ────────────────────────────────────

async function handleOrderConfirm(ctx: ConfirmContext, orderId: string) {
  const { client, userId, sessionUser, request } = ctx;

  // Fetch order and verify ownership (already scoped to the effective user)
  const { data: order, error: orderError } = await client
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("user_id", userId)
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
    user_id: userId,
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

  const { data: insertedPayment, error: paymentInsertError } = await client
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
  const { data: updatedRows, error: orderUpdateError } = await client
    .from("orders")
    .update({ status: "verifying_payment" })
    .eq("id", orderId)
    .eq("status", "payment_pending")
    .select("id");

  if (orderUpdateError || !updatedRows || updatedRows.length !== 1) {
    // Rollback: remove the orphaned payment record
    const { error: rollbackError } = await client
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

  logServerEvent(client, userId, "payment_confirmed", {
    order_id: orderId,
    payment_ref: paymentReference,
    legacy_flow: true,
  });
  notifyPaymentConfirmed({
    orderNumber: order.order_number,
    totalAmount: order.total_amount,
    orderStatus: "verifying_payment",
    paymentStatus: "processing",
    // Customer-facing channel: never leak actor email. Use the order's
    // customer_email only; if absent, send null — never fall back to the
    // session user, which may be the admin under shadow mode.
    email: order.customer_email ?? null,
    phone: order.customer_phone ?? null,
  });

  // Fire Purchase server event (fire-and-forget)
  const pixelEventId = crypto.randomUUID();
  const { ip: orderClientIp, user_agent: orderUserAgent } = extractRequestMetadata(request);
  sendConversionsEvent({
    eventName: 'Purchase',
    eventId: pixelEventId,
    eventSourceUrl: `${request.headers.get('origin') ?? ''}/payment/${orderId}`,
    userEmail: sessionUser.email ?? undefined,
    userPhone: sessionUser.phone ?? undefined,
    clientIp: orderClientIp ?? undefined,
    userAgent: orderUserAgent ?? undefined,
    customData: {
      value: order.total_amount,
      currency: order.currency ?? 'INR',
      content_ids: [orderId],
      content_type: 'product',
      order_id: orderId,
    },
  }).catch((err) => console.error('[Meta CAPI] Purchase event failed (legacy):', err));

  return NextResponse.json({
    success: true,
    order_id: orderId,
    pixel_event_id: pixelEventId,
  });
}
