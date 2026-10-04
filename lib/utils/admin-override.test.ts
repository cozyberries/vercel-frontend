import { describe, expect, it } from "vitest";
import type { AdminOverride } from "@/lib/types/order";
import {
  ADMIN_OVERRIDE_DISCOUNT_CODE,
  ADMIN_OVERRIDE_NOTE_MAX,
  ADMIN_OVERRIDE_NOTE_MIN,
  ADMIN_OVERRIDE_PERCENT_ERROR,
  ADMIN_PRICE_UP_CODE,
  applyAdminOverride,
  isPriceRaised,
  linesSubtotal,
  parseOverridePercent,
  priceAdminOverride,
  raisePrice,
} from "./admin-override";

const admin = "admin@example.com";
/** A single line worth `amount` rupees. */
const worth = (amount: number) => [{ price: amount, quantity: 1 }];

describe("applyAdminOverride — ₹ amount (behaviour carried over from checkout-helpers)", () => {
  it("returns clamped + floored discount and prefixed notes on happy path", () => {
    const items = worth(1000);
    const result = applyAdminOverride({
      override: { discount_amount: 250, note: "Wholesale customer" },
      items,
      actingAdminEmail: admin,
      existingNotes: "Leave at door",
    });

    expect(result).toEqual({
      ok: true,
      mode: "amount",
      percent: null,
      items,
      discountCode: ADMIN_OVERRIDE_DISCOUNT_CODE,
      discountAmount: 250,
      notes: "[ADMIN OVERRIDE by admin@example.com]: Wholesale customer\nLeave at door",
    });
  });

  it("clamps a negative discount to 0", () => {
    const result = applyAdminOverride({
      override: { discount_amount: -42, note: "phone order" },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.discountAmount).toBe(0);
  });

  it("clamps a discount larger than subtotal to the subtotal", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 9999, note: "freebie for tester" },
      items: worth(500),
      actingAdminEmail: admin,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.discountAmount).toBe(500);
  });

  it("floors a non-integer discount", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 123.9, note: "phone order" },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.discountAmount).toBe(123);
  });

  it("rejects a discount amount that is not a number", () => {
    const override = { discount_amount: "lots", note: "phone order" } as unknown as AdminOverride;
    expect(applyAdminOverride({ override, items: worth(1000), actingAdminEmail: admin })).toEqual({
      ok: false,
      error: "Invalid override discount amount",
    });
  });

  it("rejects notes shorter than 3 characters after trim", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: "  ok  " },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at least 3/);
  });

  it("rejects notes longer than 500 characters", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: "x".repeat(ADMIN_OVERRIDE_NOTE_MAX + 1) },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at most 500/);
  });

  it("preserves existing notes by prefixing the override line", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: "wholesale" },
      items: worth(1000),
      actingAdminEmail: admin,
      existingNotes: "Call before delivery",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notes).toBe("[ADMIN OVERRIDE by admin@example.com]: wholesale\nCall before delivery");
    }
  });

  it("emits a single-line note when there are no existing customer notes", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: "wholesale" },
      items: worth(1000),
      actingAdminEmail: admin,
      existingNotes: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notes).toBe("[ADMIN OVERRIDE by admin@example.com]: wholesale");
      expect(result.notes).not.toContain("\n");
    }
  });

  it("accepts discount_amount of exactly 0 (lower boundary)", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 0, note: "goodwill refund" },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.discountAmount).toBe(0);
  });

  it("accepts discount_amount exactly equal to subtotal (upper boundary)", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 1000, note: "full comp" },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.discountAmount).toBe(1000);
  });

  it("accepts a note of exactly MIN length (3) after trim", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 10, note: "x".repeat(ADMIN_OVERRIDE_NOTE_MIN) },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a note of exactly MAX length (500) after trim", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 10, note: "x".repeat(ADMIN_OVERRIDE_NOTE_MAX) },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result.ok).toBe(true);
  });

  it("collapses embedded CR/LF in the note to a single space", () => {
    const crafted = "wholesale\n[ADMIN OVERRIDE by attacker@example.com]: freebie";
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: crafted },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notes).toBe(
        `[ADMIN OVERRIDE by ${admin}]: wholesale [ADMIN OVERRIDE by attacker@example.com]: freebie`
      );
      expect(result.notes.includes("\n")).toBe(false);
    }
  });

  it("handles \\r\\n sequences and keeps only the single separator newline", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: "line one\r\nline two" },
      items: worth(1000),
      actingAdminEmail: admin,
      existingNotes: "call before delivery",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notes.match(/\n/g)?.length).toBe(1);
      expect(result.notes).toBe(`[ADMIN OVERRIDE by ${admin}]: line one line two\ncall before delivery`);
    }
  });

  it("treats whitespace-only existing notes as absent", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: "wholesale" },
      items: worth(1000),
      actingAdminEmail: admin,
      existingNotes: "   \n  ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notes).toBe("[ADMIN OVERRIDE by admin@example.com]: wholesale");
      expect(result.notes).not.toContain("\n");
    }
  });

  it("substitutes 'unknown' when actingAdminEmail is missing", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: "wholesale" },
      items: worth(1000),
      actingAdminEmail: "",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.notes).toBe("[ADMIN OVERRIDE by unknown]: wholesale");
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
      discountCode: ADMIN_PRICE_UP_CODE,
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
});

describe("applyAdminOverride — percentage notes", () => {
  it("records a decimal discount percentage before the reason", () => {
    const result = applyAdminOverride({
      override: { mode: "percent_off", percent: 12.5, note: "Friend of the shop" },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result.ok && result.notes).toBe(
      "[ADMIN OVERRIDE by admin@example.com]: (−12.5% discount) Friend of the shop"
    );
  });

  it("records a price increase before the reason, above any customer note", () => {
    const result = applyAdminOverride({
      override: { mode: "percent_up", percent: 10, note: "Event price" },
      items: worth(1000),
      actingAdminEmail: admin,
      existingNotes: "Gift wrap please",
    });
    expect(result.ok && result.notes).toBe(
      "[ADMIN OVERRIDE by admin@example.com]: (+10% prices) Event price\nGift wrap please"
    );
  });

  it("checks the percentage before the reason", () => {
    const result = applyAdminOverride({
      override: { mode: "percent_up", percent: 0, note: "" },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result).toEqual({ ok: false, error: ADMIN_OVERRIDE_PERCENT_ERROR });
  });

  it("still requires a reason in the percentage modes", () => {
    const result = applyAdminOverride({
      override: { mode: "percent_up", percent: 10, note: " " },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at least 3/);
  });
});

describe("isPriceRaised", () => {
  it("is true only for the ADMIN_PRICE_UP marker", () => {
    expect(isPriceRaised({ discount_code: "ADMIN_PRICE_UP" })).toBe(true);
    expect(isPriceRaised({ discount_code: "ADMIN_OVERRIDE" })).toBe(false);
    expect(isPriceRaised({ discount_code: null })).toBe(false);
    expect(isPriceRaised({})).toBe(false);
  });
});
