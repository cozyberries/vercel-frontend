import { describe, expect, it } from "vitest";
import { HSN_DESCRIPTION } from "@/lib/config/business";
import { amountsFor, registerInvoice as inv } from "./__fixtures__/register";
import {
  b2csRows,
  compareInvoiceNumbers,
  documentRuns,
  effectiveAmounts,
  hsnRows,
  isB2cl,
  sumAmounts,
  taxOf,
  ZERO,
} from "./register-summaries";

describe("amount helpers", () => {
  it("adds amounts and zeroes a cancelled row", () => {
    expect(sumAmounts([amountsFor(105000, "intra"), amountsFor(210000, "intra")])).toEqual({
      taxablePaise: 300000, cgstPaise: 7500, sgstPaise: 7500, igstPaise: 0, valuePaise: 315000,
    });
    expect(taxOf(amountsFor(105000, "inter"))).toBe(5000);
    expect(effectiveAmounts(inv({ status: "cancelled" }))).toEqual(ZERO);
    expect(effectiveAmounts(inv())).toEqual(amountsFor(105000, "intra"));
  });
});

describe("B2CL boundary", () => {
  it("is inter-state above ₹1,00,000.00 only", () => {
    expect(isB2cl(inv({ posCode: "33", valuePaise: 10_000_000 }))).toBe(false);
    expect(isB2cl(inv({ posCode: "33", valuePaise: 10_000_001 }))).toBe(true);
    expect(isB2cl(inv({ posCode: "29", valuePaise: 20_000_000 }))).toBe(false);
  });
});

describe("b2csRows", () => {
  it("groups valid invoices by place of supply and rate, leaving cancelled rows out", () => {
    const rows = b2csRows(
      [
        inv({ invoiceNumber: "CB/26-27/0001", valuePaise: 105000 }),
        inv({ invoiceNumber: "CB/26-27/0002", valuePaise: 210000 }),
        inv({ invoiceNumber: "CB/26-27/0003", valuePaise: 50000, status: "cancelled" }),
        inv({ invoiceNumber: "CB/26-27/0004", valuePaise: 105000, posCode: "33" }),
      ],
      [],
    );
    expect(rows).toEqual([
      { placeOfSupply: "29-Karnataka", ratePercent: 5, monthTaxablePaise: 300000, lessCancelledTaxablePaise: 0,
        net: { taxablePaise: 300000, cgstPaise: 7500, sgstPaise: 7500, igstPaise: 0, valuePaise: 315000 } },
      { placeOfSupply: "33-Tamil Nadu", ratePercent: 5, monthTaxablePaise: 100000, lessCancelledTaxablePaise: 0,
        net: { taxablePaise: 100000, cgstPaise: 0, sgstPaise: 0, igstPaise: 5000, valuePaise: 105000 } },
    ]);
  });

  it("subtracts earlier months' cancellations, even for a state with no sale this month", () => {
    const rows = b2csRows(
      [inv({ valuePaise: 210000 })],
      [inv({ invoiceNumber: "CB/26-27/0001", status: "cancelled" }), inv({ invoiceNumber: "CB/26-27/0002", posCode: "27", status: "cancelled" })],
    );
    expect(rows).toEqual([
      { placeOfSupply: "27-Maharashtra", ratePercent: 5, monthTaxablePaise: 0, lessCancelledTaxablePaise: 100000,
        net: { taxablePaise: -100000, cgstPaise: 0, sgstPaise: 0, igstPaise: -5000, valuePaise: -105000 } },
      { placeOfSupply: "29-Karnataka", ratePercent: 5, monthTaxablePaise: 200000, lessCancelledTaxablePaise: 100000,
        net: { taxablePaise: 100000, cgstPaise: 2500, sgstPaise: 2500, igstPaise: 0, valuePaise: 105000 } },
    ]);
  });

  it("leaves B2CL invoices out, this month's and cancelled earlier ones", () => {
    const rows = b2csRows(
      [inv({ posCode: "33", valuePaise: 10_000_001 }), inv({ invoiceNumber: "CB/26-27/0002", posCode: "33", valuePaise: 10_000_000 })],
      [inv({ invoiceNumber: "CB/26-27/0003", posCode: "33", valuePaise: 10_000_001, status: "cancelled" })],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ placeOfSupply: "33-Tamil Nadu", lessCancelledTaxablePaise: 0, net: { valuePaise: 10_000_000 } });
  });

  it("groups an unknown place of supply under a dash", () => {
    expect(b2csRows([inv({ posCode: null })], [])[0].placeOfSupply).toBe("—");
  });
});

describe("hsnRows", () => {
  it("counts pieces but not shipping, nets earlier cancellations and skips cancelled rows", () => {
    const rows = hsnRows(
      [
        inv({ invoiceNumber: "CB/26-27/0001", valuePaise: 315000, quantity: 3, shippingPaise: 9000 }),
        inv({ invoiceNumber: "CB/26-27/0002", status: "cancelled", quantity: 5 }),
      ],
      [inv({ invoiceNumber: "CB/26-27/0000", quantity: 1, status: "cancelled" })],
    );
    expect(rows).toEqual([
      {
        hsn: "6111",
        description: HSN_DESCRIPTION,
        uqc: "PCS-PIECES",
        ratePercent: 5,
        quantity: 2,
        net: { taxablePaise: 200000, cgstPaise: 5000, sgstPaise: 5000, igstPaise: 0, valuePaise: 210000 },
      },
    ]);
  });

  it("is empty with no invoices", () => {
    expect(hsnRows([], [])).toEqual([]);
  });
});

describe("invoice numbers", () => {
  it("orders by number within a series, not as text", () => {
    expect(compareInvoiceNumbers("CB/26-27/9999", "CB/26-27/10000")).toBeLessThan(0);
    expect(compareInvoiceNumbers("CB/25-26/0099", "CB/26-27/0001")).toBeLessThan(0);
  });

  it("splits documents into runs of consecutive numbers with their cancelled counts", () => {
    const numbers = [...Array.from({ length: 16 }, (_, i) => i + 1), 25, 26].map((n) => `CB/26-27/${String(n).padStart(4, "0")}`);
    const shuffled = [numbers[17], ...numbers.slice(0, 17).reverse()];
    const runs = documentRuns(
      shuffled.map((invoiceNumber) => inv({ invoiceNumber, status: invoiceNumber === "CB/26-27/0003" ? "cancelled" : "valid" })),
    );
    expect(runs).toEqual([
      { from: "CB/26-27/0001", to: "CB/26-27/0016", total: 16, cancelled: 1 },
      { from: "CB/26-27/0025", to: "CB/26-27/0026", total: 2, cancelled: 0 },
    ]);
  });

  it("starts a new run for a new series", () => {
    expect(documentRuns([inv({ invoiceNumber: "CB/25-26/0099" }), inv({ invoiceNumber: "CB/26-27/0001" })])).toEqual([
      { from: "CB/25-26/0099", to: "CB/25-26/0099", total: 1, cancelled: 0 },
      { from: "CB/26-27/0001", to: "CB/26-27/0001", total: 1, cancelled: 0 },
    ]);
  });
});
