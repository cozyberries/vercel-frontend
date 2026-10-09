import { describe, expect, it } from "vitest";
import { doc, line, retailer, TN_GSTIN } from "./__fixtures__/retail";
import { buildChallan, buildRetailInvoice, retailPdfFilename } from "./documents";

const GSTIN = "29EPDPR9174E1ZB";

describe("buildRetailInvoice", () => {
  it("bills the shop 75% of MRP with GST worked out of it, intra-state", () => {
    const inv = buildRetailInvoice({
      doc: doc({ consignment_lines: [line({ quantity: 2, unit_price_paise: 75000 }), line({ id: "l2", mrp_paise: 110000, unit_price_paise: 82500 })] }),
      retailer: retailer(),
      gstin: GSTIN,
      challanNumbers: ["CBC/26-27/0001"],
    });
    expect(inv.number).toBe("CBR/26-27/0001");
    expect(inv.date).toBe("2026-10-31");
    expect(inv.buyer).toMatchObject({ legalName: "Kids Corner LLP", tradeName: "Kids Corner", gstin: "29AAGFC4321M1ZB", stateName: "Karnataka", addressLines: ["12 MG Road", "Bengaluru 560001"] });
    expect(inv.seller).toMatchObject({ gstin: GSTIN, stateCode: "29" });
    expect(inv.placeOfSupply).toEqual({ code: "29", name: "Karnataka" });
    expect(inv.mode).toBe("intra");
    expect(inv.lines.map((l) => [l.description, l.quantity, l.mrpPaise, l.unitPricePaise, l.amountPaise])).toEqual([
      ["Petal Pops Frock (1-2Y)", 2, 100000, 75000, 150000],
      ["Petal Pops Frock (1-2Y)", 1, 110000, 82500, 82500],
    ]);
    expect(inv.totals.totalPaise).toBe(232500);
    expect(inv.totals.taxablePaise + inv.totals.cgstPaise + inv.totals.sgstPaise).toBe(232500);
    expect(inv.totalMrpPaise).toBe(310000);
    expect(inv.amountInWords).toMatch(/^Rupees Two Thousand Three Hundred Twenty Five/);
    expect(inv.challanNumbers).toEqual(["CBC/26-27/0001"]);
  });

  it("charges IGST to a shop in Tamil Nadu", () => {
    const inv = buildRetailInvoice({ doc: doc(), retailer: retailer({ gstin: TN_GSTIN, state_code: "33" }), gstin: GSTIN, challanNumbers: [] });
    expect(inv.mode).toBe("inter");
    expect(inv.placeOfSupply).toEqual({ code: "33", name: "Tamil Nadu" });
    expect(inv.totals.igstPaise).toBe(3571);
  });

  it("previews a draft at the shop's current share", () => {
    const inv = buildRetailInvoice({ doc: doc({ status: "draft", number: null, share_pct: null, consignment_lines: [line()] }), retailer: retailer({ our_share_pct: 70 }), gstin: GSTIN, challanNumbers: [] });
    expect(inv.sharePct).toBe(70);
    expect(inv.totals.totalPaise).toBe(70000);
  });

  it("bills an issued invoice to the shop as it was at issue, not as edited since", () => {
    const issued = doc({ buyer_legal_name: "Kids Corner Chennai LLP", buyer_trade_name: null, buyer_gstin: TN_GSTIN, buyer_address: "4 Anna Salai\nChennai 600002", buyer_state_code: "33" });
    const inv = buildRetailInvoice({ doc: issued, retailer: retailer(), gstin: GSTIN, challanNumbers: [] });
    expect(inv.buyer).toEqual({ legalName: "Kids Corner Chennai LLP", tradeName: null, gstin: TN_GSTIN, addressLines: ["4 Anna Salai", "Chennai 600002"], stateName: "Tamil Nadu", stateCode: "33" });
    expect(inv.mode).toBe("inter");
    expect(inv.placeOfSupply).toEqual({ code: "33", name: "Tamil Nadu" });
    expect(inv.totals.igstPaise).toBe(3571);
  });

  it("previews a draft (no snapshot) with the shop's current details", () => {
    const inv = buildRetailInvoice({ doc: doc({ status: "draft", number: null }), retailer: retailer({ gstin: TN_GSTIN, state_code: "33" }), gstin: GSTIN, challanNumbers: [] });
    expect(inv.buyer.gstin).toBe(TN_GSTIN);
    expect(inv.mode).toBe("inter");
  });

  it("refuses a document that is not a sale", () => {
    expect(() => buildRetailInvoice({ doc: doc({ kind: "challan", period: null }), retailer: retailer(), gstin: GSTIN, challanNumbers: [] })).toThrow("Not a sale document");
  });

  it("carries each line's discount and prices it at the share of the selling price", () => {
    const inv = buildRetailInvoice({
      doc: doc({ status: "draft", number: null, share_pct: null, consignment_lines: [line({ mrp_paise: 92300 }), line({ id: "l2", mrp_paise: 92300, discount_pct: 10 })] }),
      retailer: retailer(),
      gstin: GSTIN,
      challanNumbers: [],
    });
    expect(inv.lines.map((l) => [l.mrpPaise, l.discountPct, l.unitPricePaise])).toEqual([
      [92300, 0, 69225],
      [92300, 10, 62303],
    ]);
    expect(inv.totals.totalPaise).toBe(69225 + 62303);
  });
});

describe("buildChallan", () => {
  it("lists pieces at MRP with totals", () => {
    const ch = buildChallan({
      doc: doc({ kind: "challan", number: "CBC/26-27/0004", period: null, share_pct: null, doc_date: "2026-10-02", consignment_lines: [line({ quantity: 3 }), line({ id: "l2", product_name: "Bloom Romper", size: "0-3M", mrp_paise: 89900, quantity: 2 })] }),
      retailer: retailer(),
      gstin: GSTIN,
    });
    expect(ch.number).toBe("CBC/26-27/0004");
    expect(ch.lines).toEqual([
      { description: "Bloom Romper (0-3M)", hsn: "6111", quantity: 2, mrpPaise: 89900, valuePaise: 179800 },
      { description: "Petal Pops Frock (1-2Y)", hsn: "6111", quantity: 3, mrpPaise: 100000, valuePaise: 300000 },
    ]);
    expect(ch.totalQuantity).toBe(5);
    expect(ch.totalMrpPaise).toBe(479800);
  });

  it("addresses an issued challan to the shop as it was at issue", () => {
    const ch = buildChallan({
      doc: doc({ kind: "challan", period: null, share_pct: null, buyer_legal_name: "Kids Corner LLP", buyer_trade_name: "Kids Corner", buyer_gstin: "29AAGFC4321M1ZB", buyer_address: "Old Address", buyer_state_code: "29" }),
      retailer: retailer({ gstin: TN_GSTIN, state_code: "33", address: "Moved" }),
      gstin: GSTIN,
    });
    expect(ch.consignee).toMatchObject({ gstin: "29AAGFC4321M1ZB", addressLines: ["Old Address"], stateCode: "29", stateName: "Karnataka" });
  });
});

describe("retailPdfFilename", () => {
  it("uses the number, or a draft name", () => {
    expect(retailPdfFilename({ id: "abcdef12-0000", kind: "sale", number: "CBR/26-27/0001" })).toBe("CBR-26-27-0001.pdf");
    expect(retailPdfFilename({ id: "abcdef12-0000", kind: "challan", number: null })).toBe("draft-challan-abcdef12.pdf");
  });
});
