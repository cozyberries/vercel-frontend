import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { answerCallbackQuery, editTelegramMessage, buildNewOrderText } from "@/lib/services/telegram";

const UNPAID_STATUSES = ["payment_pending", "verifying_payment"];
const STOCK_ERROR = /^(OUT_OF_STOCK|VARIANT_NOT_FOUND):(.*)$/;

type OrderForConfirm = {
  id: string;
  status: string;
  user_id: string;
  total_amount: number;
  currency: string | null;
};

/**
 * Moves the order's payment to `completed`. The live UPI flow never creates a
 * payment row (the customer only sends a WhatsApp screenshot), so one is
 * inserted when none exists. A fully discounted order has nothing to record
 * (payments.amount must be > 0).
 */
async function completePayment(
  supabase: SupabaseClient,
  order: OrderForConfirm,
  adminName: string
): Promise<boolean> {
  if (Number(order.total_amount) <= 0) return true;

  const { data: updated, error: updateError } = await supabase
    .from("payments")
    .update({ status: "completed" })
    .eq("order_id", order.id)
    .in("status", ["pending", "processing"])
    .select("id");
  if (updateError) {
    console.error("[Webhook] Failed to complete payment:", { updateError, orderId: order.id });
    return false;
  }
  if (updated?.length) return true;

  const { error: insertError } = await supabase.from("payments").insert({
    order_id: order.id,
    user_id: order.user_id,
    payment_reference: `upi_tg_${crypto.randomUUID()}`,
    payment_method: "upi",
    gateway_provider: "manual",
    amount: order.total_amount,
    currency: order.currency ?? "INR",
    status: "completed",
    gateway_response: {
      confirmed_via: "telegram",
      confirmed_by: adminName,
      confirmed_at: new Date().toISOString(),
    },
  });
  if (insertError) {
    console.error("[Webhook] Failed to record payment:", { insertError, orderId: order.id });
    return false;
  }
  return true;
}

export async function POST(request: NextRequest) {
  // Read lazily so a missing secret can never be cached at module load.
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (!webhookSecret || secret !== webhookSecret) {
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
  const adminName = from.username ? `@${from.username}` : from.first_name;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: order, error: loadError } = await supabase
    .from("orders")
    .select("id, status, user_id, total_amount, currency")
    .eq("id", orderId)
    .maybeSingle();

  if (loadError) {
    console.error("[Webhook] Failed to load order:", { loadError, orderId });
    await answerCallbackQuery(callbackId, "❌ Failed to load order");
    return NextResponse.json({ ok: true });
  }

  if (!order || !UNPAID_STATUSES.includes(order.status)) {
    await answerCallbackQuery(callbackId, "⚠️ Already confirmed or not found");
    return NextResponse.json({ ok: true });
  }

  // Unpaid → processing. The orders_on_status_change trigger commits stock
  // and assigns the invoice number in the same statement.
  const { data: confirmed, error: orderError } = await supabase
    .from("orders")
    .update({ status: "processing" })
    .eq("id", orderId)
    .eq("status", order.status)
    .select("id, invoice_number");

  if (orderError) {
    const stock = STOCK_ERROR.exec(orderError.message ?? "");
    if (stock) {
      await answerCallbackQuery(callbackId, `❌ Out of stock: ${stock[2].trim()}`);
      return NextResponse.json({ ok: true });
    }
    console.error("[Webhook] Failed to update order:", orderError);
    await answerCallbackQuery(callbackId, "❌ Failed to update order");
    return NextResponse.json({ ok: true });
  }

  if (!confirmed?.length) {
    await answerCallbackQuery(callbackId, "⚠️ Already confirmed or not found");
    return NextResponse.json({ ok: true });
  }

  const paymentRecorded = await completePayment(supabase, order as OrderForConfirm, adminName);
  if (!paymentRecorded) {
    // Put the order back where it was; the trigger returns the stock. The
    // invoice number stays assigned and is reused on the retry.
    const { error: revertError } = await supabase
      .from("orders")
      .update({ status: order.status })
      .eq("id", orderId)
      .eq("status", "processing");
    if (revertError) {
      console.error("[Webhook] Failed to revert order after payment failure — manual cleanup required:", {
        revertError,
        orderId,
        callbackId,
      });
    }
    await answerCallbackQuery(callbackId, "❌ Payment update failed — please retry");
    return NextResponse.json({ ok: true });
  }

  const invoiceNumber = (confirmed[0] as { invoice_number?: string | null }).invoice_number ?? null;
  await answerCallbackQuery(
    callbackId,
    invoiceNumber ? `✅ Payment confirmed · ${invoiceNumber}` : "✅ Payment confirmed!"
  );

  // Rebuild the message so the chat shows who confirmed it.
  const { data: full } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", orderId)
    .single();

  if (full) {
    const items = (full.order_items ?? []).map((i: {
      name: string; quantity: number; size?: string | null;
    }) => ({ name: i.name, quantity: i.quantity, size: i.size ?? null }));

    const updatedText =
      buildNewOrderText(
        {
          orderId: full.id,
          orderNumber: full.order_number,
          email: full.customer_email,
          phone: full.customer_phone ?? null,
          shippingAddress: full.shipping_address ?? null,
          totalAmount: full.total_amount,
          subtotal: full.subtotal,
          deliveryCharge: full.delivery_charge ?? 0,
          discountCode: full.discount_code ?? null,
          discountAmount: full.discount_amount ?? 0,
          items,
          fulfilmentMethod: full.fulfilment_method ?? "delivery",
          customerName: full.customer_name ?? null,
        },
        `✅ <b>Payment Confirmed</b>`
      ) +
      (invoiceNumber ? `\n\n🧾 Invoice <code>${invoiceNumber}</code>` : "") +
      `\n\n✅ <b>Confirmed by ${adminName}</b>`;

    await editTelegramMessage(message.chat.id, message.message_id, updatedText);
  }

  return NextResponse.json({ ok: true });
}
