import { describe, expect, it } from "vitest";
import { computeGst, taxModeFor, type InvoiceLineInput } from "./gst";

const line = (unitPrice: number, quantity = 1, description = "Frock · Size 3-4Y"): InvoiceLineInput => ({
  description,
  hsn: "6111",
  quantity,
  unitPrice,
});

describe("taxModeFor", () => {
  it("is intra-state only when the place of supply is the home state", () => {
    expect(taxModeFor("29", "29")).toBe("intra");
    expect(taxModeFor("33", "29")).toBe("inter");
    expect(taxModeFor(null, "29")).toBe("inter");
    expect(taxModeFor(undefined, "29")).toBe("inter");
  });
});

describe("computeGst", () => {
  it("splits 5% inclusive GST into CGST + SGST within the state", () => {
    const { lines, totals } = computeGst({ lines: [line(1050)], discountRupees: 0, deliveryChargeRupees: 0, mode: "intra" });
    expect(lines[0]).toMatchObject({ amountPaise: 105000, taxablePaise: 100000, cgstPaise: 2500, sgstPaise: 2500, igstPaise: 0 });
    expect(totals.totalPaise).toBe(105000);
  });

  it("charges IGST between states", () => {
    const { lines } = computeGst({ lines: [line(1050)], discountRupees: 0, deliveryChargeRupees: 0, mode: "inter" });
    expect(lines[0]).toMatchObject({ taxablePaise: 100000, cgstPaise: 0, sgstPaise: 0, igstPaise: 5000 });
  });

  it("gives the odd paisa of tax to SGST", () => {
    const { lines } = computeGst({ lines: [line(999)], discountRupees: 0, deliveryChargeRupees: 0, mode: "intra" });
    expect(lines[0]).toMatchObject({ taxablePaise: 95143, cgstPaise: 2378, sgstPaise: 2379 });
    expect(lines[0].taxablePaise + lines[0].cgstPaise + lines[0].sgstPaise).toBe(99900);
  });

  it("spreads a discount over lines by value", () => {
    const { lines, totals } = computeGst({
      lines: [line(1000), line(500, 2)],
      discountRupees: 150,
      deliveryChargeRupees: 0,
      mode: "intra",
    });
    expect(lines.map((l) => l.discountPaise)).toEqual([7500, 7500]);
    expect(lines.map((l) => l.amountPaise)).toEqual([92500, 92500]);
    expect(totals.discountPaise).toBe(15000);
    expect(totals.totalPaise).toBe(185000);
  });

  it("puts the discount's leftover paise on the last line", () => {
    const { lines, totals } = computeGst({
      lines: [line(333), line(333), line(334)],
      discountRupees: 100,
      deliveryChargeRupees: 0,
      mode: "intra",
    });
    expect(lines.map((l) => l.discountPaise)).toEqual([3330, 3330, 3340]);
    expect(totals.totalPaise).toBe(90000);
  });

  it("adds a taxed shipping line for delivery charges", () => {
    const { lines } = computeGst({ lines: [line(1000)], discountRupees: 0, deliveryChargeRupees: 90, mode: "inter" });
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatchObject({ description: "Shipping charges", hsn: "6111", amountPaise: 9000, taxablePaise: 8571, igstPaise: 429 });
  });

  it("always adds up exactly to goods − discount + delivery", () => {
    for (const prices of [[1], [199, 349], [799, 1299, 1599], [2499, 3, 5, 7]]) {
      for (const discount of [0, 1, 37, 100]) {
        for (const delivery of [0, 90]) {
          for (const mode of ["intra", "inter"] as const) {
            const input = prices.map((p) => line(p, 1 + (p % 3)));
            const goods = input.reduce((s, l) => s + l.unitPrice * 100 * l.quantity, 0);
            const d = Math.min(discount * 100, goods);
            const { lines, totals } = computeGst({ lines: input, discountRupees: discount, deliveryChargeRupees: delivery, mode });
            expect(totals.totalPaise).toBe(goods - d + delivery * 100);
            for (const l of lines) {
              expect(l.taxablePaise + l.cgstPaise + l.sgstPaise + l.igstPaise).toBe(l.amountPaise);
            }
          }
        }
      }
    }
  });
});
