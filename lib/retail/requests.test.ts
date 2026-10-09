import { describe, expect, it } from "vitest";
import { parseDocAction, parseDocSave, parsePayment, parseRateInput, parseRetailer } from "./requests";

const NOW = new Date("2026-10-08T06:00:00Z"); // 8 Oct 2026, 11:30 IST

describe("parseRetailer", () => {
  it("normalises the GSTIN, blanks and the share", () => {
    expect(parseRetailer({ legal_name: " Kids Corner LLP ", gstin: "29aagfc4321m1zb", address: "12 MG Road", email: "", phone: " ", our_share_pct: 75 })).toEqual({
      ok: true,
      value: { legal_name: "Kids Corner LLP", trade_name: null, gstin: "29AAGFC4321M1ZB", address: "12 MG Road", contact_name: null, phone: null, email: null, our_share_pct: 75, active: true },
    });
  });
  it("refuses a bad GSTIN, a share of 100 and a bad email", () => {
    expect(parseRetailer({ legal_name: "A", gstin: "29AAGFC4321M1ZC", address: "x" })).toEqual({ ok: false, error: "This GSTIN's last character doesn't match: check for a typo" });
    expect(parseRetailer({ legal_name: "A", gstin: "29AAGFC4321M1ZB", address: "x", our_share_pct: 100 })).toMatchObject({ ok: false });
    expect(parseRetailer({ legal_name: "A", gstin: "29AAGFC4321M1ZB", address: "x", email: "nope" })).toEqual({ ok: false, error: "Enter a valid email" });
    expect(parseRetailer({ gstin: "29AAGFC4321M1ZB", address: "x" })).toMatchObject({ ok: false });
  });
});

describe("parseDocSave", () => {
  it("accepts a challan dated today or earlier", () => {
    expect(parseDocSave({ kind: "challan", doc_date: "2026-10-08", lines: [{ variant_slug: "a", quantity: 2, mrp_paise: 100000 }] }, NOW)).toEqual({
      ok: true,
      value: { kind: "challan", doc_id: null, doc_date: "2026-10-08", lines: [{ variant_slug: "a", quantity: 2, mrp_paise: 100000 }] },
    });
  });
  it("refuses a future date, an empty challan, a fractional quantity", () => {
    expect(parseDocSave({ kind: "challan", doc_date: "2026-10-09", lines: [{ variant_slug: "a", quantity: 1, mrp_paise: 1 }] }, NOW)).toEqual({ ok: false, error: "The date can't be in the future" });
    expect(parseDocSave({ kind: "challan", doc_date: "2026-10-08", lines: [] }, NOW)).toEqual({ ok: false, error: "Add at least one item" });
    expect(parseDocSave({ kind: "return", doc_date: "2026-10-08", lines: [{ variant_slug: "a", quantity: 1.5 }] }, NOW)).toMatchObject({ ok: false });
  });
  it("refuses a date in a month already filed for GST", () => {
    const closed = { ok: false, error: "That month is closed for GST: use a date in an open month" };
    // 8 Oct: September is open until its GSTR-1 is due on the 11th.
    expect(parseDocSave({ kind: "challan", doc_date: "2026-09-01", lines: [{ variant_slug: "a", quantity: 1, mrp_paise: 1 }] }, NOW)).toMatchObject({ ok: true });
    expect(parseDocSave({ kind: "challan", doc_date: "2026-08-31", lines: [{ variant_slug: "a", quantity: 1, mrp_paise: 1 }] }, NOW)).toEqual(closed);
    expect(parseDocSave({ kind: "return", doc_date: "2026-09-30", lines: [{ variant_slug: "a", quantity: 1 }] }, new Date("2026-10-11T00:00:00+05:30"))).toEqual(closed);
  });
  it("accepts a sale for this month or earlier, dropping zero lines", () => {
    expect(parseDocSave({ kind: "sale", period: "2026-09", lines: [{ variant_slug: "a", quantity: 0 }, { variant_slug: "b", quantity: 3 }] }, NOW)).toEqual({
      ok: true,
      value: { kind: "sale", period: "2026-09", lines: [{ variant_slug: "b", quantity: 3, discount_pct: 0 }] },
    });
    expect(parseDocSave({ kind: "sale", period: "2026-11", lines: [] }, NOW)).toEqual({ ok: false, error: "Pick a month up to this one" });
  });
  it("refuses an unknown kind", () => {
    expect(parseDocSave({ kind: "gift" }, NOW)).toMatchObject({ ok: false });
  });
});

describe("parseDocAction and parsePayment", () => {
  it("parses issue and cancel only", () => {
    expect(parseDocAction({ action: "issue" })).toEqual({ ok: true, value: { action: "issue" } });
    expect(parseDocAction({ action: "delete" })).toMatchObject({ ok: false });
  });
  it("parses a payment", () => {
    expect(parsePayment({ amount_paise: 150000, paid_on: "2026-10-05", method: "upi", reference: " UTR9 ", doc_id: null }, NOW)).toEqual({
      ok: true,
      value: { amount_paise: 150000, paid_on: "2026-10-05", method: "upi", reference: "UTR9", doc_id: null },
    });
    expect(parsePayment({ amount_paise: 0, paid_on: "2026-10-05", method: "upi" }, NOW)).toMatchObject({ ok: false });
    expect(parsePayment({ amount_paise: 1, paid_on: "2026-10-05", method: "card" }, NOW)).toMatchObject({ ok: false });
  });
});

describe("parseRateInput", () => {
  const NOW = new Date("2026-10-09T06:00:00Z");
  it("accepts a rate for this month or an earlier one", () => {
    expect(parseRateInput({ period: "2026-10", rate_pct: 10 }, NOW)).toEqual({ ok: true, value: { period: "2026-10", rate_pct: 10 } });
    expect(parseRateInput({ period: "2026-09", rate_pct: 12.5 }, NOW)).toEqual({ ok: true, value: { period: "2026-09", rate_pct: 12.5 } });
  });
  it.each([
    [{ period: "2026-10", rate_pct: 0 }, "Discount must be above 0% and below 100%"],
    [{ period: "2026-10", rate_pct: 100 }, "Discount must be above 0% and below 100%"],
    [{ period: "2026-10", rate_pct: "10" }, "Discount must be above 0% and below 100%"],
    [{ period: "2026-10" }, "Discount must be above 0% and below 100%"],
    [{ period: "2026-10", rate_pct: 12.345 }, "Use at most two decimals"],
    [{ period: "2026-11", rate_pct: 10 }, "Pick a month up to this one"],
    [{ period: "October", rate_pct: 10 }, "Pick a month up to this one"],
  ])("refuses %j", (body, error) => {
    expect(parseRateInput(body, NOW)).toEqual({ ok: false, error });
  });
});

describe("parseDocSave sale discounts", () => {
  const NOW = new Date("2026-10-09T06:00:00Z");
  it("defaults a sale line's discount to 0 and keeps a given one", () => {
    const r = parseDocSave({ kind: "sale", period: "2026-09", lines: [{ variant_slug: "a", quantity: 1 }, { variant_slug: "a", quantity: 2, discount_pct: 10 }] }, NOW);
    expect(r).toEqual({ ok: true, value: { kind: "sale", period: "2026-09", lines: [{ variant_slug: "a", quantity: 1, discount_pct: 0 }, { variant_slug: "a", quantity: 2, discount_pct: 10 }] } });
  });
  it("refuses a discount of 100% or more", () => {
    expect(parseDocSave({ kind: "sale", period: "2026-09", lines: [{ variant_slug: "a", quantity: 1, discount_pct: 100 }] }, NOW).ok).toBe(false);
  });
});
