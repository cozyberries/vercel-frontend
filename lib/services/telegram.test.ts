import { afterEach, describe, expect, it, vi } from "vitest";
import { buildNewOrderText, type NewOrderData } from "./telegram";

const base: NewOrderData = {
  orderId: "order-1",
  orderNumber: "ORD-20260925-00001",
  email: "asha@example.com",
  phone: "9876543210",
  shippingAddress: { full_name: "Asha Rao", address_line_1: "12 MG Road", city: "Bengaluru", state: "Karnataka", postal_code: "560001", country: "India" },
  totalAmount: 1050,
  subtotal: 1050,
  deliveryCharge: 0,
  discountCode: null,
  discountAmount: 0,
  items: [{ name: "Frock", quantity: 1, size: "3-4Y" }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("buildNewOrderText", () => {
  it("keeps the delivery address and adds no tags for a plain delivery order", () => {
    const text = buildNewOrderText(base, "HEADER", "now");
    expect(text).toContain("📍 Deliver to:");
    expect(text).not.toContain("PICKUP");
    expect(text).not.toContain("CASH");
  });

  it("tags pickup orders and shows the stall instead of an address", () => {
    const text = buildNewOrderText({ ...base, shippingAddress: null, fulfilmentMethod: "pickup", customerName: "Asha Rao" }, "HEADER", "now");
    expect(text).toContain("🏬 <b>PICKUP</b>");
    expect(text).toContain("📍 Collect at stall");
    expect(text).not.toContain("Deliver to");
    expect(text).toContain("🙍 Asha Rao");
  });

  it("tags cash and names the staff member who recorded it", () => {
    const text = buildNewOrderText(
      { ...base, fulfilmentMethod: "pickup", paymentMethod: "cash", placedByEmail: "staff@cozyberries.in" },
      "HEADER",
      "now"
    );
    expect(text).toContain("🏬 <b>PICKUP</b> · 💵 <b>CASH</b>");
    expect(text).toContain("👩‍💼 Placed by staff@cozyberries.in");
  });

  it("escapes HTML in customer-controlled fields", () => {
    const text = buildNewOrderText({ ...base, customerName: "<b>x</b>" }, "HEADER", "now");
    expect(text).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

describe("notifyNewOrder", () => {
  it("always attaches the confirm-payment button and uses the given header", async () => {
    vi.resetModules();
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "chat-1");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const { notifyNewOrder } = await import("./telegram");

    notifyNewOrder(base, { header: "🛒 <b>New Order Placed</b>" });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.text.startsWith("🛒 <b>New Order Placed</b>")).toBe(true);
    expect(payload.reply_markup.inline_keyboard[0][0]).toEqual({
      text: "✅ Confirm Payment",
      callback_data: "confirm_payment:order-1",
    });
  });
});
