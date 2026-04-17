import { describe, expect, it } from "vitest";
import {
  ADMIN_OVERRIDE_DISCOUNT_CODE,
  ADMIN_OVERRIDE_NOTE_MAX,
  applyAdminOverride,
} from "./checkout-helpers";

const admin = "admin@example.com";

describe("applyAdminOverride", () => {
  it("returns clamped + floored discount and prefixed notes on happy path", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 250, note: "Wholesale customer" },
      subtotal: 1000,
      actingAdminEmail: admin,
      existingNotes: "Leave at door",
    });

    expect(result).toEqual({
      ok: true,
      discountCode: ADMIN_OVERRIDE_DISCOUNT_CODE,
      discountAmount: 250,
      notes: "[ADMIN OVERRIDE by admin@example.com]: Wholesale customer\nLeave at door",
    });
  });

  it("clamps a negative discount to 0", () => {
    const result = applyAdminOverride({
      override: { discount_amount: -42, note: "phone order" },
      subtotal: 1000,
      actingAdminEmail: admin,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.discountAmount).toBe(0);
  });

  it("clamps a discount larger than subtotal to the subtotal", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 9999, note: "freebie for tester" },
      subtotal: 500,
      actingAdminEmail: admin,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.discountAmount).toBe(500);
  });

  it("floors a non-integer discount", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 123.9, note: "phone order" },
      subtotal: 1000,
      actingAdminEmail: admin,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.discountAmount).toBe(123);
  });

  it("rejects notes shorter than 3 characters after trim", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: "  ok  " },
      subtotal: 1000,
      actingAdminEmail: admin,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at least 3/);
  });

  it("rejects notes longer than 500 characters", () => {
    const tooLong = "x".repeat(ADMIN_OVERRIDE_NOTE_MAX + 1);
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: tooLong },
      subtotal: 1000,
      actingAdminEmail: admin,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at most 500/);
  });

  it("preserves existing notes by prefixing the override line", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: "wholesale" },
      subtotal: 1000,
      actingAdminEmail: admin,
      existingNotes: "Call before delivery",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notes).toBe(
        "[ADMIN OVERRIDE by admin@example.com]: wholesale\nCall before delivery"
      );
    }
  });

  it("emits a single-line note when there are no existing customer notes", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: "wholesale" },
      subtotal: 1000,
      actingAdminEmail: admin,
      existingNotes: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notes).toBe(
        "[ADMIN OVERRIDE by admin@example.com]: wholesale"
      );
      expect(result.notes).not.toContain("\n");
    }
  });

  it("substitutes 'unknown' when actingAdminEmail is missing", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: "wholesale" },
      subtotal: 1000,
      actingAdminEmail: "",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notes).toBe("[ADMIN OVERRIDE by unknown]: wholesale");
    }
  });
});
