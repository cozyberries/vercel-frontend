import { describe, expect, it } from "vitest";
import { allowedFromStatuses, parsePickupAction, parsePickupTab, PICKUP_TARGET_STATUS, startOfIstDay } from "./pickup";

describe("pickup transitions", () => {
  it("parses tabs and actions strictly", () => {
    expect(parsePickupTab(null)).toBe("handover");
    expect(parsePickupTab("ready")).toBe("ready");
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
