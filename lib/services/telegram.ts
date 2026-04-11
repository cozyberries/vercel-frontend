// lib/services/telegram.ts
// Fire-and-forget Telegram alerts for the CozyBerries admin group.
// All exported notify* functions are void — callers must NOT await them.

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/** Format a Date as "11 Apr 2026, 02:34 PM IST" */
function toIST(date: Date): string {
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** Escape user-controlled strings for Telegram HTML parse mode. */
function escapeHtml(val: string | null | undefined): string {
  if (!val) return "";
  return val.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Raw HTTP POST to Telegram Bot API. Never throws. */
async function sendToTelegram(text: string, replyMarkup?: object): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.warn("[Telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping alert");
    return;
  }
  try {
    const payload: Record<string, unknown> = { chat_id: CHAT_ID, text, parse_mode: "HTML" };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) {
      const body = await res.text();
      console.error("[Telegram] Failed to send message:", res.status, body);
    }
  } catch (err) {
    console.error("[Telegram] Error sending message:", err);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toStatusLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Webhook helpers (awaitable — used by /api/telegram/webhook) ──────────────

/** Answer a Telegram callback query — clears the button loading spinner. */
export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        ...(text ? { text, show_alert: false } : {}),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[Telegram] answerCallbackQuery failed:", res.status, res.statusText, body);
    }
  } catch (err) {
    console.error("[Telegram] Error answering callback query:", err);
  }
}

/** Edit an existing message (e.g., after admin confirms payment). */
export async function editTelegramMessage(
  chatId: number,
  messageId: number,
  text: string
): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[Telegram] Failed to edit message:", res.status, body);
    }
  } catch (err) {
    console.error("[Telegram] Error editing message:", err);
  }
}

// ─── Exported alert functions ─────────────────────────────────────────────────

export function notifyCheckoutInitiated(data: {
  email: string;
  phone: string | null;
  itemCount: number;
}): void {
  const ts = toIST(new Date());
  void sendToTelegram(
    `🛍️ <b>Checkout Initiated</b>\n\n` +
    `👤 ${escapeHtml(data.email)}\n` +
    (data.phone ? `📱 ${escapeHtml(data.phone)}\n` : "") +
    `\n🛒 ${data.itemCount} item${data.itemCount !== 1 ? "s" : ""}\n` +
    `\n⏰ ${ts}`
  );
}

export type NewOrderData = {
  orderId: string;
  orderNumber: string;
  email: string;
  phone: string | null;
  shippingAddress: {
    full_name?: string | null;
    address_line_1?: string | null;
    address_line_2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  } | null;
  totalAmount: number;
  subtotal: number;
  deliveryCharge: number;
  discountCode: string | null;
  discountAmount: number;
  items: Array<{ name: string; quantity: number; size: string | null }>;
};

/** Builds the order message body. Pass a different header to re-use after confirmation. */
export function buildNewOrderText(data: NewOrderData, header: string, ts?: string): string {
  const timestamp = ts ?? toIST(new Date());

  const contactSection =
    `👤 ${escapeHtml(data.email)}\n` +
    (data.phone ? `📱 ${escapeHtml(data.phone)}` : "");

  const a = data.shippingAddress;
  const cityState = [escapeHtml(a?.city), escapeHtml(a?.state)].filter(Boolean).join(", ");
  const addressLines = [
    escapeHtml(a?.full_name),
    escapeHtml(a?.address_line_1),
    escapeHtml(a?.address_line_2),
    cityState,
    escapeHtml(a?.postal_code),
    escapeHtml(a?.country),
  ].filter(Boolean);
  const addressSection = addressLines.length
    ? `📍 Deliver to:\n${addressLines.join("\n")}`
    : null;

  const circled = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩"];
  const itemRows = data.items.map((i, idx) => {
    const num = circled[idx] ?? `${idx + 1}.`;
    const sizeLine = i.size ? `\n   📐 ${escapeHtml(i.size)}  ×${i.quantity}` : `\n   ×${i.quantity}`;
    return `${num} ${escapeHtml(i.name)}${sizeLine}`;
  });

  const discountLine = data.discountCode
    ? `🏷️ Discount (${escapeHtml(data.discountCode)}): −₹${data.discountAmount.toLocaleString("en-IN")}\n`
    : "";
  const deliveryLine = data.deliveryCharge > 0
    ? `🚚 Delivery: ₹${data.deliveryCharge.toLocaleString("en-IN")}\n`
    : `🚚 Delivery: Free\n`;
  const pricingSection =
    `💰 Subtotal: ₹${data.subtotal.toLocaleString("en-IN")}\n` +
    discountLine +
    deliveryLine +
    `💵 Total: ₹${data.totalAmount.toLocaleString("en-IN")}`;

  return (
    `${header}\n\n` +
    `📋 <code>${escapeHtml(data.orderNumber)}</code>\n\n` +
    contactSection + "\n\n" +
    (addressSection ? addressSection + "\n\n" : "") +
    `📦 Items (${data.items.length}):\n\n` +
    itemRows.join("\n\n") + "\n\n" +
    pricingSection + "\n\n" +
    `📌 Order ID: <code>${escapeHtml(data.orderId)}</code>\n\n` +
    `⏰ ${timestamp}`
  );
}

/**
 * Combined "New Order Placed + Payment in Review" notification with an inline "Confirm Payment" button.
 * Replaces the separate notifyOrderPlaced + notifyPaymentConfirmed calls in the session flow.
 * callback_data format: `confirm_payment:{orderId}` (max 64 bytes — UUID is 36 + 16 prefix = 52 ✓)
 */
export function notifyNewOrder(data: NewOrderData): void {
  const text = buildNewOrderText(data, `🛒 <b>New Order Placed + Payment in Review</b>`);
  const replyMarkup = {
    inline_keyboard: [[
      { text: "✅ Confirm Payment", callback_data: `confirm_payment:${data.orderId}` },
    ]],
  };
  void sendToTelegram(text, replyMarkup);
}

export function notifyOrderPlaced(data: {
  orderNumber: string;
  orderStatus: string;
  email: string;
  phone: string | null;
  shippingAddress: {
    full_name?: string | null;
    address_line_1?: string | null;
    address_line_2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  } | null;
  totalAmount: number;
  subtotal: number;
  deliveryCharge: number;
  discountCode: string | null;
  discountAmount: number;
  items: Array<{ name: string; quantity: number; size: string | null }>;
}): void {
  const ts = toIST(new Date());

  const orderSection =
    `📋 <code>${escapeHtml(data.orderNumber)}</code>\n` +
    `📊 ${toStatusLabel(data.orderStatus)}`;

  const contactSection =
    `👤 ${escapeHtml(data.email)}\n` +
    (data.phone ? `📱 ${escapeHtml(data.phone)}` : "");

  const a = data.shippingAddress;
  const cityState = [escapeHtml(a?.city), escapeHtml(a?.state)].filter(Boolean).join(", ");
  const addressLines = [
    escapeHtml(a?.full_name),
    escapeHtml(a?.address_line_1),
    escapeHtml(a?.address_line_2),
    cityState,
    escapeHtml(a?.postal_code),
    escapeHtml(a?.country),
  ].filter(Boolean);
  const addressSection = addressLines.length
    ? `📍 Deliver to:\n${addressLines.join("\n")}`
    : null;

  const circled = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩"];
  const itemRows = data.items.map((i, idx) => {
    const num = circled[idx] ?? `${idx + 1}.`;
    const sizeLine = i.size ? `\n   📐 ${escapeHtml(i.size)}  ×${i.quantity}` : `\n   ×${i.quantity}`;
    return `${num} ${escapeHtml(i.name)}${sizeLine}`;
  });

  const discountLine = data.discountCode
    ? `🏷️ Discount (${escapeHtml(data.discountCode)}): −₹${data.discountAmount.toLocaleString("en-IN")}\n`
    : "";
  const deliveryLine = data.deliveryCharge > 0
    ? `🚚 Delivery: ₹${data.deliveryCharge.toLocaleString("en-IN")}\n`
    : `🚚 Delivery: Free\n`;
  const pricingSection =
    `💰 Subtotal: ₹${data.subtotal.toLocaleString("en-IN")}\n` +
    discountLine +
    deliveryLine +
    `💵 Total: ₹${data.totalAmount.toLocaleString("en-IN")}`;

  void sendToTelegram(
    `🛒 <b>New Order Placed</b>\n\n` +
    orderSection + "\n\n" +
    contactSection + "\n\n" +
    (addressSection ? addressSection + "\n\n" : "") +
    `📦 Items (${data.items.length}):\n\n` +
    itemRows.join("\n\n") + "\n\n" +
    pricingSection + "\n\n" +
    `⏰ ${ts}`
  );
}

export function notifyPaymentConfirmed(data: {
  orderNumber: string;
  totalAmount: number;
  orderStatus: string;
  paymentStatus: string;
  email: string | null;
  phone: string | null;
}): void {
  const ts = toIST(new Date());
  void sendToTelegram(
    `💸 <b>Payment Confirmed</b>\n\n` +
    `📋 <code>${escapeHtml(data.orderNumber)}</code>\n` +
    `📊 Order: ${toStatusLabel(data.orderStatus)}\n` +
    `💳 Payment: ${toStatusLabel(data.paymentStatus)}\n\n` +
    (data.email ? `👤 ${escapeHtml(data.email)}\n` : "") +
    (data.phone ? `📱 ${escapeHtml(data.phone)}\n` : "") +
    `\n💵 ₹${data.totalAmount.toLocaleString("en-IN")}\n` +
    `\n⏰ ${ts}`
  );
}

export function notifyNewUserRegistered(data: {
  name: string | null;
  email: string | null;
  phone: string;
}): void {
  const ts = toIST(new Date());
  void sendToTelegram(
    `👤 <b>New User Registered</b>\n\n` +
    (data.name ? `🙍 ${escapeHtml(data.name)}\n\n` : "") +
    (data.email ? `📧 ${escapeHtml(data.email)}\n` : "") +
    `📱 ${escapeHtml(data.phone)}\n` +
    `\n⏰ ${ts}`
  );
}

export function notifyNewRating(data: {
  productSlug: string;
  rating: number;
  comment: string | null;
  email: string | null;
  phone: string | null;
}): void {
  const ts = toIST(new Date());
  const safeRating = Math.max(0, Math.min(5, Math.round(Number(data.rating) || 0)));
  const stars = "⭐".repeat(safeRating) + "☆".repeat(5 - safeRating);
  const comment = data.comment?.trim();
  void sendToTelegram(
    `⭐ <b>New Rating</b>\n\n` +
    (data.email ? `👤 ${escapeHtml(data.email)}\n` : "") +
    (data.phone ? `📱 ${escapeHtml(data.phone)}\n` : "") +
    `\n📦 ${escapeHtml(data.productSlug)}\n` +
    `${stars}  (${safeRating}/5)\n` +
    (comment ? `\n💬 "${escapeHtml(comment.slice(0, 120))}${comment.length > 120 ? "…" : ""}"\n` : "") +
    `\n⏰ ${ts}`
  );
}

export function notifyUnserviceablePincode(data: {
  pincode: string;
  district: string | null | undefined;
  state: string | null | undefined;
}): void {
  const ts = toIST(new Date());
  const cityState = [escapeHtml(data.district), escapeHtml(data.state)].filter(Boolean).join(", ");
  void sendToTelegram(
    `🚫 <b>Unserviceable Pincode</b>\n\n` +
    `📮 ${escapeHtml(data.pincode)}\n` +
    (cityState ? `📍 ${cityState}\n` : "") +
    `\n⏰ ${ts}`
  );
}

export function notifyTrackingGap(data: {
  orderId: string;
  email: string | null;
  phone: string | null;
}): void {
  const ts = toIST(new Date());
  void sendToTelegram(
    `📦 <b>Tracking Requested — Not Set</b>\n\n` +
    (data.email ? `👤 ${escapeHtml(data.email)}\n` : "") +
    (data.phone ? `📱 ${escapeHtml(data.phone)}\n` : "") +
    `\n🔖 <code>${escapeHtml(data.orderId)}</code>\n` +
    `\n⏰ ${ts}`
  );
}
