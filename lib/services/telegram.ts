// lib/services/telegram.ts
// Fire-and-forget Telegram alerts for the CozyBerries admin group.
// All exported functions are void — callers must NOT await them.

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

/** Raw HTTP POST to Telegram Bot API. Never throws. */
async function sendToTelegram(text: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.warn("[Telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping alert");
    return;
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
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

// ─── Exported alert functions ─────────────────────────────────────────────────

export function notifyCheckoutInitiated(data: {
  email: string;
  itemCount: number;
}): void {
  const ts = toIST(new Date());
  void sendToTelegram(
    `🛍️ <b>Checkout Initiated</b>\n👤 ${data.email}\n🛒 ${data.itemCount} item${data.itemCount !== 1 ? "s" : ""}\n⏰ ${ts}`
  );
}

export function notifyOrderPlaced(data: {
  orderNumber: string;
  email: string;
  totalAmount: number;
  itemCount: number;
}): void {
  const ts = toIST(new Date());
  void sendToTelegram(
    `🛒 <b>New Order Placed</b>\n📋 Order #${data.orderNumber}\n👤 ${data.email}\n💰 ₹${data.totalAmount.toLocaleString("en-IN")}\n🛍️ ${data.itemCount} item${data.itemCount !== 1 ? "s" : ""}\n⏰ ${ts}`
  );
}

export function notifyPaymentConfirmed(data: {
  orderNumber: string;
  totalAmount: number;
}): void {
  const ts = toIST(new Date());
  void sendToTelegram(
    `💸 <b>Payment Confirmed</b>\n📋 Order #${data.orderNumber}\n💰 ₹${data.totalAmount.toLocaleString("en-IN")}\n⏰ ${ts}`
  );
}

export function notifyNewUserRegistered(data: {
  name: string | null;
  email: string | null;
  phone: string;
}): void {
  const ts = toIST(new Date());
  const nameLine = data.name ? `\n🙍 ${data.name}` : "";
  const emailLine = data.email ? `\n📧 ${data.email}` : "";
  void sendToTelegram(
    `👤 <b>New User Registered</b>${nameLine}${emailLine}\n📱 ${data.phone}\n⏰ ${ts}`
  );
}

export function notifyNewRating(data: {
  productSlug: string;
  rating: number;
  comment: string | null;
}): void {
  const ts = toIST(new Date());
  const stars = "⭐".repeat(data.rating) + "☆".repeat(5 - data.rating);
  const commentLine =
    data.comment && data.comment.trim()
      ? `\n💬 "${data.comment.trim().slice(0, 80)}${data.comment.trim().length > 80 ? "…" : ""}"`
      : "";
  void sendToTelegram(
    `⭐ <b>New Rating</b>\n📦 ${data.productSlug}\n${stars} (${data.rating}/5)${commentLine}\n⏰ ${ts}`
  );
}

export function notifyUnserviceablePincode(data: {
  pincode: string;
  district: string | null | undefined;
  state: string | null | undefined;
}): void {
  const ts = toIST(new Date());
  const location = [data.district, data.state].filter(Boolean).join(", ");
  const locationLine = location ? ` — ${location}` : "";
  void sendToTelegram(
    `🚫 <b>Unserviceable Pincode</b>\n📍 ${data.pincode}${locationLine}\n⏰ ${ts}`
  );
}

export function notifyTrackingGap(data: { orderId: string }): void {
  const ts = toIST(new Date());
  const shortId = `${data.orderId.slice(0, 8)}...`;
  void sendToTelegram(
    `📦 <b>Tracking Requested — Not Set</b>\n🔖 Order ID: ${shortId}\n⏰ ${ts}`
  );
}
