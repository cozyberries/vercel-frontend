import { describe, expect, it } from "vitest";
import { allowedFromStatuses, collectedAt, parsePickupAction, parsePickupTab, PICKUP_TARGET_STATUS, startOfIstDay } from "./pickup";

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
