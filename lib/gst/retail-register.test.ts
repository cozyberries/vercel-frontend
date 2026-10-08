import { describe, expect, it } from "vitest";
import { doc, line, retailer, TN_GSTIN } from "@/lib/retail/__fixtures__/retail";
import { GSTIN, NOW, orderRow } from "./__fixtures__/register";
import { toB2bInvoice, type RetailRegisterRow } from "./retail-register";
import { buildSalesRegister } from "./sales-register";

const row = (o: Partial<RetailRegisterRow> = {}): RetailRegisterRow => ({ ...doc({ period: "2026-09", doc_date: "2026-09-30", number: "CBR/26-27/0001" }), retailers: retailer(), ...o });

describe("toB2bInvoice", () => {
  it("carries the shop's GSTIN and the invoice's tax split", () => {
    expect(toB2bInvoice(row(), GSTIN)).toEqual({
      docId: "doc-1",
      invoiceNumber: "CBR/26-27/0001",
      invoiceDate: "2026-09-30",
      retailerName: "Kids Corner LLP",
      retailerGstin: "29AAGFC4321M1ZB",
      placeOfSupply: { code: "29", name: "Karnataka" },
      mode: "intra",
      ratePercent: 5,
      status: "valid",
      amounts: { taxablePaise: 71429, cgstPaise: 1785, sgstPaise: 1786, igstPaise: 0, valuePaise: 75000 },
      lines: [{ hsn: "6111", quantity: 1, taxablePaise: 71429, cgstPaise: 1785, sgstPaise: 1786, igstPaise: 0, valuePaise: 75000 }],
    });
  });

  it("keeps the shop's details from issue when the shop was edited since", () => {
    const issued = row({ buyer_legal_name: "Kids Corner LLP", buyer_trade_name: "Kids Corner", buyer_gstin: "29AAGFC4321M1ZB", buyer_address: "12 MG Road", buyer_state_code: "29", retailers: retailer({ legal_name: "Kids Corner TN", gstin: TN_GSTIN, state_code: "33" }) });
    expect(toB2bInvoice(issued, GSTIN)).toMatchObject({ retailerName: "Kids Corner LLP", retailerGstin: "29AAGFC4321M1ZB", placeOfSupply: { code: "29", name: "Karnataka" }, mode: "intra" });
  });
});

describe("buildSalesRegister with shops", () => {
  const register = () =>
    buildSalesRegister({
      month: "2026-09",
      orders: [orderRow()],
      cancelledEarlier: [],
      missingNumbers: [],
      gstin: GSTIN,
      now: NOW,
      retail: {
        invoices: [
          row(),
          row({ id: "doc-2", number: "CBR/26-27/0002", status: "cancelled", cancelled_at: "2026-10-02T05:00:00Z" }),
          row({ id: "doc-3", number: "CBR/26-27/0003", retailers: retailer({ gstin: TN_GSTIN, state_code: "33", legal_name: "Tiny Toes" }), consignment_lines: [line({ quantity: 2, unit_price_paise: 75000 })] }),
        ],
        challans: [
          { number: "CBC/26-27/0001", status: "issued" },
          { number: "CBC/26-27/0002", status: "cancelled" },
          { number: "CBC/26-27/0003", status: "issued" },
        ],
      },
    });

  it("lists shop invoices, zeroing a cancelled one, and totals B2B apart from B2C", () => {
    const r = register();
    expect(r.b2b.map((i) => [i.invoiceNumber, i.status, i.mode])).toEqual([
      ["CBR/26-27/0001", "valid", "intra"],
      ["CBR/26-27/0002", "cancelled", "intra"],
      ["CBR/26-27/0003", "valid", "inter"],
    ]);
    expect(r.totals.b2b.valuePaise).toBe(75000 + 150000);
    expect(r.totals.b2bIssued).toBe(3);
    expect(r.totals.b2bCancelled).toBe(1);
    expect(r.totals.combinedNet.valuePaise).toBe(r.totals.net.valuePaise + 225000);
    expect(r.b2cs.reduce((s, x) => s + x.net.valuePaise, 0)).toBe(105000);
  });

  it("splits HSN into B2C and B2B and adds invoice and challan runs", () => {
    const r = register();
    expect(r.hsnB2b).toEqual([expect.objectContaining({ hsn: "6111", quantity: 3, net: expect.objectContaining({ valuePaise: 225000 }) })]);
    expect(r.hsn).toEqual([expect.objectContaining({ quantity: 1 })]);
    expect(r.documents).toEqual([
      { from: "CB/26-27/0001", to: "CB/26-27/0001", total: 1, cancelled: 0 },
      { from: "CBR/26-27/0001", to: "CBR/26-27/0003", total: 3, cancelled: 1 },
    ]);
    expect(r.challans).toEqual([{ from: "CBC/26-27/0001", to: "CBC/26-27/0003", total: 3, cancelled: 1 }]);
  });

  it("keeps old callers working with no shop data", () => {
    const r = buildSalesRegister({ month: "2026-09", orders: [orderRow()], cancelledEarlier: [], missingNumbers: [], gstin: GSTIN, now: NOW });
    expect(r.b2b).toEqual([]);
    expect(r.challans).toEqual([]);
    expect(r.totals.combinedNet).toEqual(r.totals.net);
  });
});
