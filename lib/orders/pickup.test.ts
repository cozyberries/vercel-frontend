import { describe, expect, it } from "vitest";
import { allowedFromStatuses, billMessage, collectedAt, parsePickupAction, parsePickupTab, PICKUP_TARGET_STATUS, startOfIstDay } from "./pickup";

describe("pickup transitions", () => {
  it("parses tabs and actions strictly", () => {
    expect(parsePickupTab(null)).toBe("handover");
    expect(parsePickupTab("ready")).toBe("ready");
    expect(parsePickupTab("awaiting")).toBe("awaiting");
    expect(parsePickupTab("bogus")).toBeNull();
    expect(parsePickupAction("collected")).toBe("collected");
    expect(parsePickupAction("shipped")).toBeNull();
  });

  it("only paid orders can be marked ready", () => {
    expect(allowedFromStatuses("ready")).toEqual(["payment_confirmed", "processing"]);
    expect(PICKUP_TARGET_STATUS.ready).toBe("ready_for_pickup");
  });

  it("paid or ready orders can be marked collected (counter sale skips ready)", () => {
    expect(allowedFromStatuses("collected")).toEqual(["payment_confirmed", "processing", "ready_for_pickup"]);
    expect(PICKUP_TARGET_STATUS.collected).toBe("collected");
  });
});

describe("startOfIstDay", () => {
  it("is 18:30 UTC the previous day", () => {
    expect(startOfIstDay(new Date("2026-09-25T10:00:00Z")).toISOString()).toBe("2026-09-24T18:30:00.000Z");
  });
  it("rolls over at IST midnight, not UTC midnight", () => {
    expect(startOfIstDay(new Date("2026-09-25T19:00:00Z")).toISOString()).toBe("2026-09-25T18:30:00.000Z");
  });
});

describe("collectedAt", () => {
  it("is the moment the order was marked collected, not a later edit", () => {
    expect(
      collectedAt({
        updated_at: "2026-09-27T04:33:10.000Z",
        order_status_events: [
          { to_status: "verifying_payment", created_at: "2026-09-26T09:54:37.000Z" },
          { to_status: "collected", created_at: "2026-09-26T09:54:38.000Z" },
        ],
      })
    ).toBe("2026-09-26T09:54:38.000Z");
  });

  it("takes the latest collected event when an order was collected twice", () => {
    expect(
      collectedAt({
        updated_at: "2026-09-27T08:00:00.000Z",
        order_status_events: [
          { to_status: "collected", created_at: "2026-09-26T10:00:00.000Z" },
          { to_status: "processing", created_at: "2026-09-27T05:00:00.000Z" },
          { to_status: "collected", created_at: "2026-09-27T06:00:00.000Z" },
        ],
      })
    ).toBe("2026-09-27T06:00:00.000Z");
  });

  it("falls back to the last update when no collected event was written (admin app)", () => {
    expect(collectedAt({ updated_at: "2026-09-27T04:00:00.000Z", order_status_events: [] })).toBe("2026-09-27T04:00:00.000Z");
    expect(collectedAt({ updated_at: "2026-09-27T04:00:00.000Z" })).toBe("2026-09-27T04:00:00.000Z");
  });
});

describe("billMessage", () => {
  const url = "https://cozyberries.in/bill/0508cd47-20a6-45ff-82f0-b328b1a1401b/xVbKMwj31GzIYlIzQyBxVu";

  it("thanks the customer, gives the bill link, then says who we are and how to reach us", () => {
    expect(billMessage({ order_number: "ORD-20261002-120745-00309", invoice_number: "CB/26-27/0020", customer_name: "Asha" }, url)).toBe(
      [
        "Hi Asha! 👋",
        "Thanks for shopping at CozyBerries stall 💛",
        "",
        "Your bill for order ORD-20261002-120745-00309 (invoice CB/26-27/0020):",
        url,
        "",
        "We make soft, breathable muslin clothing for babies and little ones. Muslin is a light, airy cotton weave that's gentle on delicate skin, keeps babies cool, and gets softer with every wash 🌿",
        "",
        "🛍️ Shop online: cozyberries.in",
        "📱 WhatsApp: +91 74114 31101",
        "📸 Instagram: https://www.instagram.com/cozy_berries",
        "✉️ cozyberriesofficial@gmail.com",
      ].join("\n")
    );
  });

  it("leaves out the invoice number when the order has none yet", () => {
    const text = billMessage({ order_number: "ORD-1", invoice_number: null, customer_name: "Asha" }, url);
    expect(text).toContain(`Your bill for order ORD-1:\n${url}`);
    expect(text).not.toContain("invoice");
  });

  it("says a plain Hi when the customer has no name on file", () => {
    expect(billMessage({ order_number: "ORD-1", invoice_number: null, customer_name: null }, url).split("\n")[0]).toBe("Hi! 👋");
  });
});
