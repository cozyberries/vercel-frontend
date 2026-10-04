import { describe, expect, it } from "vitest";
import type { AdminOverride } from "@/lib/types/order";
import {
  ADMIN_OVERRIDE_DISCOUNT_CODE,
  ADMIN_OVERRIDE_NOTE_MAX,
  ADMIN_OVERRIDE_PERCENT_ERROR,
  ADMIN_PRICE_UP_GST_ERROR,
  applyAdminOverride,
  linesSubtotal,
  parseOverridePercent,
  priceAdminOverride,
  raisePrice,
} from "./admin-override";

/** A single line worth `amount` rupees. */
const worth = (amount: number) => [{ price: amount, quantity: 1 }];

describe("applyAdminOverride — ₹ amount", () => {
  it("returns the clamped, floored discount and its audit record", () => {
    const items = worth(1000);
    expect(applyAdminOverride({ override: { discount_amount: 250, note: "Wholesale customer" }, items })).toEqual({
      ok: true,
      mode: "amount",
      percent: null,
      items,
      discountCode: ADMIN_OVERRIDE_DISCOUNT_CODE,
      discountAmount: 250,
      audit: { mode: "amount", percent: null, amount: 250, catalogueSubtotal: 1000, reason: "Wholesale customer" },
    });
  });

  it("clamps a negative discount to 0", () => {
    const result = applyAdminOverride({ override: { discount_amount: -42 }, items: worth(1000) });
    expect(result.ok && result.discountAmount).toBe(0);
  });

  it("clamps a discount larger than the subtotal to the subtotal", () => {
    const result = applyAdminOverride({ override: { discount_amount: 9999 }, items: worth(500) });
    expect(result.ok && result.audit.amount).toBe(500);
  });

  it("floors a non-integer discount", () => {
    const result = applyAdminOverride({ override: { discount_amount: 123.9 }, items: worth(1000) });
    expect(result.ok && result.discountAmount).toBe(123);
  });

  it("rejects a discount amount that is not a number", () => {
    const override = { discount_amount: "lots" } as unknown as AdminOverride;
    expect(applyAdminOverride({ override, items: worth(1000) })).toEqual({
      ok: false,
      error: "Invalid override discount amount",
    });
  });

  it("keeps a short reason", () => {
    const result = applyAdminOverride({ override: { discount_amount: 100, note: "  ok  " }, items: worth(1000) });
    expect(result.ok && result.audit.reason).toBe("ok");
  });

  it("records no reason when it is blank or missing", () => {
    const blank = applyAdminOverride({ override: { discount_amount: 100, note: "   " }, items: worth(1000) });
    const missing = applyAdminOverride({ override: { discount_amount: 100 }, items: worth(1000) });
    expect(blank.ok && blank.audit.reason).toBeNull();
    expect(missing.ok && missing.audit.reason).toBeNull();
  });

  it("rejects a reason longer than 500 characters", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: "x".repeat(ADMIN_OVERRIDE_NOTE_MAX + 1) },
      items: worth(1000),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at most 500/);
  });

  it("accepts a reason of exactly 500 characters", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 10, note: "x".repeat(ADMIN_OVERRIDE_NOTE_MAX) },
      items: worth(1000),
    });
    expect(result.ok).toBe(true);
  });

  it("collapses CR/LF in the reason to single spaces", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: "line one\r\nline two\nline three" },
      items: worth(1000),
    });
    expect(result.ok && result.audit.reason).toBe("line one line two line three");
  });

  it("returns no note text for orders.notes", () => {
    const result = applyAdminOverride({ override: { discount_amount: 100, note: "x" }, items: worth(1000) });
    expect(result).not.toHaveProperty("notes");
  });
});

describe("parseOverridePercent", () => {
  it.each([
    [0.1, 1],
    [10, 100],
    [12.5, 125],
    [28.2, 282],
    [100, 1000],
  ])("reads %s%% as %s tenths", (input, tenths) => {
    expect(parseOverridePercent(input)).toBe(tenths);
  });

  it.each([0, 0.05, 100.1, -5, 12.55, Number.NaN, Number.POSITIVE_INFINITY, "10", null, undefined])(
    "rejects %s",
    (input) => {
      expect(parseOverridePercent(input)).toBeNull();
    }
  );
});

describe("raisePrice", () => {
  it("rounds each unit price to the nearest rupee", () => {
    expect(raisePrice(899, 100)).toBe(989);
    expect(raisePrice(649, 100)).toBe(714);
  });

  it("rounds an exact half up, which the plain floating-point formula gets wrong", () => {
    // ₹250 at +28.2% is exactly ₹320.50; the plain formula lands just below it.
    expect((250 * (100 + 28.2)) / 100).toBeLessThan(320.5);
    expect(raisePrice(250, 282)).toBe(321);
  });

  it("doubles a price at the 100% cap", () => {
    expect(raisePrice(899, 1000)).toBe(1798);
  });
});

describe("priceAdminOverride — percentages", () => {
  const lines = [
    { id: "p1", price: 899, quantity: 2 },
    { id: "p2", price: 649, quantity: 1 },
  ];

  it("percent_up raises every unit price and keeps quantities and other fields", () => {
    const result = priceAdminOverride({ mode: "percent_up", percent: 10, note: "x" }, lines);
    expect(result).toEqual({
      ok: true,
      mode: "percent_up",
      percent: 10,
      items: [
        { id: "p1", price: 989, quantity: 2 },
        { id: "p2", price: 714, quantity: 1 },
      ],
      discountCode: null,
      discountAmount: 0,
    });
    if (result.ok) expect(linesSubtotal(result.items)).toBe(2692);
  });

  it("percent_up leaves the lines it was given unchanged", () => {
    priceAdminOverride({ mode: "percent_up", percent: 10, note: "x" }, lines);
    expect(lines.map((l) => l.price)).toEqual([899, 649]);
  });

  it("percent_off rounds the discount to the nearest rupee and keeps catalogue prices", () => {
    // 12.5% of ₹2,447 is ₹305.875.
    expect(priceAdminOverride({ mode: "percent_off", percent: 12.5, note: "x" }, lines)).toEqual({
      ok: true,
      mode: "percent_off",
      percent: 12.5,
      items: lines,
      discountCode: ADMIN_OVERRIDE_DISCOUNT_CODE,
      discountAmount: 306,
    });
  });

  it("percent_off at 100% takes off the whole subtotal", () => {
    const result = priceAdminOverride({ mode: "percent_off", percent: 100, note: "x" }, lines);
    expect(result.ok && result.discountAmount).toBe(2447);
  });

  it.each([0, 100.1, -5, 12.55, Number.NaN])("rejects a percent of %s", (percent) => {
    expect(priceAdminOverride({ mode: "percent_up", percent, note: "x" }, lines)).toEqual({
      ok: false,
      error: ADMIN_OVERRIDE_PERCENT_ERROR,
    });
  });

  it("rejects a percent sent as a string or left out", () => {
    const asString = { mode: "percent_off", percent: "10", note: "x" } as unknown as AdminOverride;
    const missing = { mode: "percent_off", note: "x" } as unknown as AdminOverride;
    expect(priceAdminOverride(asString, lines).ok).toBe(false);
    expect(priceAdminOverride(missing, lines).ok).toBe(false);
  });

  it("rejects an unknown mode", () => {
    const override = { mode: "percent_sideways", percent: 10, note: "x" } as unknown as AdminOverride;
    expect(priceAdminOverride(override, lines)).toEqual({ ok: false, error: "Unknown override mode" });
  });

  it("treats an explicit amount mode like a request with no mode", () => {
    const result = priceAdminOverride({ mode: "amount", discount_amount: 100, note: "x" }, lines);
    expect(result.ok && result.discountAmount).toBe(100);
  });

  describe("GST ceiling on a raise", () => {
    it("accepts ₹1,784 at +40% (₹2,498)", () => {
      const result = priceAdminOverride({ mode: "percent_up", percent: 40, note: "x" }, worth(1784));
      expect(result.ok && result.items[0].price).toBe(2498);
    });

    it("refuses ₹1,784 at +40.2% (₹2,501)", () => {
      expect(priceAdminOverride({ mode: "percent_up", percent: 40.2, note: "x" }, worth(1784))).toEqual({
        ok: false,
        error: ADMIN_PRICE_UP_GST_ERROR,
      });
    });

    it("accepts a raise that lands on exactly ₹2,500", () => {
      const result = priceAdminOverride({ mode: "percent_up", percent: 25, note: "x" }, worth(2000));
      expect(result.ok && result.items[0].price).toBe(2500);
    });

    it("refuses the whole order when one of two lines goes past ₹2,500", () => {
      const lines = [
        { price: 899, quantity: 2 },
        { price: 1784, quantity: 1 },
      ];
      expect(priceAdminOverride({ mode: "percent_up", percent: 50, note: "x" }, lines)).toEqual({
        ok: false,
        error: ADMIN_PRICE_UP_GST_ERROR,
      });
    });

    it("still reports a bad percent as a percent error", () => {
      expect(priceAdminOverride({ mode: "percent_up", percent: 150, note: "x" }, worth(1784))).toEqual({
        ok: false,
        error: ADMIN_OVERRIDE_PERCENT_ERROR,
      });
    });

    it("does not apply to a discount on a ₹3,000 line", () => {
      const result = priceAdminOverride({ mode: "percent_off", percent: 50, note: "x" }, worth(3000));
      expect(result.ok && result.discountAmount).toBe(1500);
    });
  });
});

describe("applyAdminOverride — percentage audit", () => {
  const lines = [
    { id: "p1", price: 899, quantity: 2 },
    { id: "p2", price: 649, quantity: 1 },
  ];

  it("records a raise as the rupees added across the order", () => {
    const result = applyAdminOverride({ override: { mode: "percent_up", percent: 10, note: "Event price" }, items: lines });
    expect(result.ok && result.discountCode).toBeNull();
    expect(result.ok && result.audit).toEqual({
      mode: "percent_up",
      percent: 10,
      amount: 245, // ₹2,692 raised − ₹2,447 catalogue
      catalogueSubtotal: 2447,
      reason: "Event price",
    });
  });

  it("records a percentage discount as the rupees taken off", () => {
    const result = applyAdminOverride({ override: { mode: "percent_off", percent: 12.5 }, items: lines });
    expect(result.ok && result.discountCode).toBe(ADMIN_OVERRIDE_DISCOUNT_CODE);
    expect(result.ok && result.audit).toEqual({
      mode: "percent_off",
      percent: 12.5,
      amount: 306,
      catalogueSubtotal: 2447,
      reason: null,
    });
  });

  it("checks the percentage before the reason", () => {
    const result = applyAdminOverride({
      override: { mode: "percent_up", percent: 0, note: "x".repeat(ADMIN_OVERRIDE_NOTE_MAX + 1) },
      items: worth(1000),
    });
    expect(result).toEqual({ ok: false, error: ADMIN_OVERRIDE_PERCENT_ERROR });
  });
});
