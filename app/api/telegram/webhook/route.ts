import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { answerCallbackQuery, editTelegramMessage, buildNewOrderText } from "@/lib/services/telegram";

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  // Verify the request is from Telegram
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Ignore non-callback updates (message events, etc.)
  const callbackQuery = body.callback_query as {
    id: string;
    from: { username?: string; first_name: string };
    message: { message_id: number; chat: { id: number } };
    data?: string;
  } | undefined;

  if (!callbackQuery) {
    return NextResponse.json({ ok: true });
  }

  const { id: callbackId, from, message, data: callbackData } = callbackQuery;

  if (!callbackData?.startsWith("confirm_payment:")) {
    await answerCallbackQuery(callbackId);
    return NextResponse.json({ ok: true });
  }

  const orderId = callbackData.slice("confirm_payment:".length);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Update order: verifying_payment → processing
  const { error: orderError, data: updatedRows } = await supabase
    .from("orders")
    .update({ status: "processing" })
    .eq("id", orderId)
    .eq("status", "verifying_payment")
    .select("id");

  if (orderError) {
    console.error("[Webhook] Failed to update order:", orderError);
    await answerCallbackQuery(callbackId, "❌ Failed to update order");
    return NextResponse.json({ ok: true });
  }

  if (!updatedRows?.length) {
    // Already confirmed or wrong state
    await answerCallbackQuery(callbackId, "⚠️ Already confirmed or not found");
    return NextResponse.json({ ok: true });
  }

  // Update payment: processing → completed
  const { error: paymentError, data: updatedPayment } = await supabase
    .from("payments")
    .update({ status: "completed" })
    .eq("order_id", orderId)
    .eq("status", "processing")
    .select("id");

  if (paymentError || !updatedPayment?.length) {
    console.error("[Webhook] Failed to update payment status — reverting order:", {
      paymentError,
      orderId,
      affectedRows: updatedPayment?.length ?? 0,
    });
    // Revert order so admin can retry
    await supabase
      .from("orders")
      .update({ status: "verifying_payment" })
      .eq("id", orderId)
      .eq("status", "processing");
    await answerCallbackQuery(callbackId, "❌ Payment update failed — please retry");
    return NextResponse.json({ ok: true });
  }

  // Answer callback (clears button loading state)
  const adminName = from.username ? `@${from.username}` : from.first_name;
  await answerCallbackQuery(callbackId, "✅ Payment confirmed!");

  // Fetch order + items to rebuild the message with proper HTML formatting
  const { data: order } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", orderId)
    .single();

  if (order) {
    const items = (order.order_items ?? []).map((i: {
      name: string; quantity: number; size?: string | null;
    }) => ({ name: i.name, quantity: i.quantity, size: i.size ?? null }));

    const updatedText =
      buildNewOrderText(
        {
          orderId: order.id,
          orderNumber: order.order_number,
          email: order.customer_email,
          phone: order.customer_phone ?? null,
          shippingAddress: order.shipping_address,
          totalAmount: order.total_amount,
          subtotal: order.subtotal,
          deliveryCharge: order.delivery_charge ?? 0,
          discountCode: order.discount_code ?? null,
          discountAmount: order.discount_amount ?? 0,
          items,
        },
        `✅ <b>New Order Placed</b>`
      ) + `\n\n✅ <b>Confirmed by ${adminName}</b>`;

    await editTelegramMessage(message.chat.id, message.message_id, updatedText);
  }

  return NextResponse.json({ ok: true });
}
