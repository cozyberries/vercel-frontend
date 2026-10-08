import { afterEach, describe, expect, it, vi } from "vitest";

// Both knobs are read on every call, so each test flips the fields it needs.
const cfg = vi.hoisted(() => ({
  offer: {
    code: "EARLY5",
    discountRate: 0.05,
    expiresAt: new Date("2099-01-01T00:00:00Z"),
    enabled: false,
    label: "Early Bird Offer",
    badgeText: "5% OFF",
  },
  mrp: {
    discountRate: 0.1,
    shownSince: new Date("2026-09-27T00:00:00+05:30"),
    shownUntil: new Date("2099-01-01T00:00:00Z") as Date,
  },
}));
const ENDED = new Date("2026-10-07T00:00:00+05:30");
vi.mock("@/lib/config/offers", () => ({ EARLY_BIRD_OFFER: cfg.offer, MRP_DISPLAY: cfg.mrp }));

import { getDiscountedPrice, mrpFor, mrpTotals } from "./discount";

afterEach(() => {
  cfg.offer.enabled = false;
  cfg.mrp.discountRate = 0.1;
  cfg.mrp.shownUntil = new Date("2099-01-01T00:00:00Z");
});

describe("mrpFor", () => {
  it("puts the catalogue price exactly 10% below the MRP", () => {
    expect(mrpFor(450)).toBe(500);
    expect(mrpFor(599)).toBe(666);
  });

  it("returns the price itself when the MRP display is off", () => {
    cfg.mrp.discountRate = 0;
    expect(mrpFor(450)).toBe(450);
  });

  it("returns the price itself once the MRP display has ended", () => {
    cfg.mrp.shownUntil = ENDED;
    expect(mrpFor(450)).toBe(450);
  });

  it("still gives the MRP for a moment inside the display window", () => {
    cfg.mrp.shownUntil = ENDED;
    expect(mrpFor(450, "2026-10-06T23:59:59+05:30")).toBe(500);
    expect(mrpFor(450, "2026-10-07T00:00:00+05:30")).toBe(450);
  });
});

describe("getDiscountedPrice", () => {
  it("shows the MRP struck through and charges the catalogue price", () => {
    expect(getDiscountedPrice(450)).toEqual({
      original: 500,
      discounted: 450,
      savings: 50,
      badgeText: "10% OFF",
    });
  });

  it("never lets rounding push the badge off 10% for real prices", () => {
    for (let price = 100; price <= 5000; price++) {
      const { discounted, badgeText } = getDiscountedPrice(price);
      expect({ price, discounted, badgeText }).toEqual({ price, discounted: price, badgeText: "10% OFF" });
    }
  });

  it("shows a plain price when neither the MRP nor a coupon is on", () => {
    cfg.mrp.discountRate = 0;
    expect(getDiscountedPrice(450)).toEqual({ original: 450, discounted: 450, savings: 0, badgeText: null });
  });

  it("shows a plain price with no badge once the MRP display has ended", () => {
    cfg.mrp.shownUntil = ENDED;
    expect(getDiscountedPrice(923)).toEqual({ original: 923, discounted: 923, savings: 0, badgeText: null });
  });

  it("keeps the Early Bird behaviour when only the coupon is on", () => {
    cfg.mrp.discountRate = 0;
    cfg.offer.enabled = true;
    expect(getDiscountedPrice(450)).toEqual({ original: 450, discounted: 427, savings: 23, badgeText: "5% OFF" });
  });

  it("stacks the coupon on top of the MRP and badges the combined saving", () => {
    cfg.offer.enabled = true;
    expect(getDiscountedPrice(450)).toEqual({ original: 500, discounted: 427, savings: 73, badgeText: "15% OFF" });
  });
});

describe("mrpTotals", () => {
  const items = [
    { price: 450, quantity: 2 },
    { price: 599, quantity: 1 },
  ];

  it("sums the MRP of every line and the saving against the catalogue subtotal", () => {
    expect(mrpTotals(items)).toEqual({ totalMrp: 1666, mrpSavings: 167 });
  });

  it("reports no saving while the MRP display is off", () => {
    cfg.mrp.discountRate = 0;
    expect(mrpTotals(items)).toEqual({ totalMrp: 1499, mrpSavings: 0 });
  });

  it("reports no saving for an order placed before the MRP was shown", () => {
    expect(mrpTotals(items, "2026-09-26T18:29:59Z")).toEqual({ totalMrp: 1499, mrpSavings: 0 });
  });

  it("reports the saving for an order placed once the MRP was shown", () => {
    expect(mrpTotals(items, "2026-09-26T18:30:00Z")).toEqual({ totalMrp: 1666, mrpSavings: 167 });
  });

  it("keeps the saving on an order placed while the MRP was shown, after the display ended", () => {
    cfg.mrp.shownUntil = ENDED;
    expect(mrpTotals(items, "2026-10-04T19:49:09+05:30")).toEqual({ totalMrp: 1666, mrpSavings: 167 });
  });

  it("reports no saving for an order placed after the MRP display ended", () => {
    cfg.mrp.shownUntil = ENDED;
    expect(mrpTotals(items, "2026-10-07T00:00:00+05:30")).toEqual({ totalMrp: 1499, mrpSavings: 0 });
  });

  it("reports no saving for a cart once the MRP display has ended", () => {
    cfg.mrp.shownUntil = ENDED;
    expect(mrpTotals(items)).toEqual({ totalMrp: 1499, mrpSavings: 0 });
  });
});
