import { NextRequest, NextResponse } from "next/server";
import {
  effectiveUserErrorResponse,
  getEffectiveUser,
} from "@/lib/services/effective-user";
import { notifyNewOrder } from "@/lib/services/telegram";

/**
 * Stall staff record a cash payment while impersonating the customer.
 * This does NOT confirm the payment: the order moves to verifying_payment and
 * the owner confirms it with the Telegram ✅ button, the same as UPI.
 *
 * `actingAdminId` is set only under a verified impersonation cookie, and in
 * that case `client` is the service-role client (see getEffectiveUser), so
 * every query below is still scoped to the impersonated customer's id.
 */
export async function POST(request: NextRequest) {
  try {
    const result = await getEffectiveUser();
    if (!result.ok) {
      return effectiveUserErrorResponse(result);
    }
    const { userId, actingAdminId, client, sessionUser } = result;

    if (!actingAdminId) {
      return NextResponse.json(
        { error: "Only stall staff can record a cash payment" },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as { orderId?: unknown };
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    const { data: order, error: orderError } = await client
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", orderId)
      .eq("user_id", userId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.status !== "payment_pending") {
      return NextResponse.json({ error: "This order is not awaiting payment" }, { status: 409 });
    }
    if (Number(order.total_amount) <= 0) {
      return NextResponse.json(
        { error: "Nothing to collect for this order — confirm it on Telegram" },
        { status: 400 }
      );
    }

    const { data: payment, error: paymentError } = await client
      .from("payments")
      .insert({
        order_id: orderId,
        user_id: userId,
        payment_reference: `cash_${crypto.randomUUID()}`,
        payment_method: "cash",
        gateway_provider: "manual",
        amount: order.total_amount,
        currency: order.currency ?? "INR",
        status: "processing",
        gateway_response: {
          method: "cash_at_stall",
          recorded_by: actingAdminId,
          recorded_at: new Date().toISOString(),
        },
      })
      .select("id")
      .single();

    if (paymentError || !payment) {
      if (paymentError?.code === "23505") {
        return NextResponse.json({ error: "A payment already exists for this order" }, { status: 409 });
      }
      console.error("[payments/cash] insert failed:", paymentError);
      return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
    }

    const { data: moved, error: moveError } = await client
      .from("orders")
      .update({ status: "verifying_payment" })
      .eq("id", orderId)
      .eq("status", "payment_pending")
      .select("id");

    if (moveError || !moved || moved.length !== 1) {
      // Compensating delete: the order moved on (or the update failed), so the
      // cash row must not linger as a phantom payment.
      const { error: rollbackError } = await client.from("payments").delete().eq("id", payment.id);
      if (rollbackError) {
        console.error("[payments/cash] rollback failed — orphaned payment needs manual cleanup:", {
          rollbackError,
          paymentId: payment.id,
          orderId,
        });
      }
      if (moveError) {
        console.error("[payments/cash] order update failed:", moveError);
        return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
      }
      return NextResponse.json({ error: "This order is not awaiting payment" }, { status: 409 });
    }

    const { error: eventError } = await client.from("order_status_events").insert({
      order_id: orderId,
      from_status: "payment_pending",
      to_status: "verifying_payment",
      actor_admin_id: actingAdminId,
    });
    if (eventError) {
      console.error("[payments/cash] audit insert failed:", { eventError, orderId });
    }

    notifyNewOrder(
      {
        orderId,
        orderNumber: order.order_number,
        email: order.customer_email,
        phone: order.customer_phone ?? null,
        shippingAddress: order.shipping_address ?? null,
        totalAmount: order.total_amount,
        subtotal: order.subtotal,
        deliveryCharge: order.delivery_charge ?? 0,
        discountCode: order.discount_code ?? null,
        discountAmount: order.discount_amount ?? 0,
        items: (order.order_items ?? []).map((i: { name: string; quantity: number; size?: string | null }) => ({
          name: i.name,
          quantity: i.quantity,
          size: i.size ?? null,
        })),
        fulfilmentMethod: order.fulfilment_method ?? "delivery",
        paymentMethod: "cash",
        customerName: order.customer_name ?? null,
        placedByEmail: sessionUser.email ?? null,
      },
      { header: "💵 <b>Cash received at stall — confirm</b>" }
    );

    return NextResponse.json({ success: true, status: "verifying_payment" });
  } catch (error) {
    console.error("[payments/cash] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
