import { describe, expect, it } from "vitest";
import { balance, doc, line, payment, retailer } from "./__fixtures__/retail";
import { holdingsFrom, retailerSummary } from "./holdings";

const TODAY = "2026-11-08";

describe("holdingsFrom", () => {
  it("groups batches per size, oldest first, dropping empty batches", () => {
    const h = holdingsFrom(
      [
        balance({ batch_line_id: "b2", sent_on: "2026-10-20", mrp_paise: 110000, held: 2 }),
        balance({ batch_line_id: "b1", sent_on: "2026-05-01", held: 1 }),
        balance({ batch_line_id: "b0", held: 0 }),
        balance({ batch_line_id: "c1", variant_slug: "bloom-romper-0-3m", product_name: "Bloom Romper", size: "0-3M", held: 4 }),
      ],
      TODAY,
    );
    expect(h.map((x) => [x.productName, x.size, x.held])).toEqual([
      ["Bloom Romper", "0-3M", 4],
      ["Petal Pops Frock", "1-2Y", 3],
    ]);
    const frock = h[1];
    expect(frock.batches.map((b) => b.batch_line_id)).toEqual(["b1", "b2"]);
    expect(frock.mrpValuePaise).toBe(100000 + 220000);
    expect(frock.oldestSentOn).toBe("2026-05-01");
    expect(frock.band).toBe("red");
    expect(frock.batches.map((b) => b.band)).toEqual(["red", "ok"]);
  });
});

describe("retailerSummary", () => {
  it("adds up pieces, MRP value, invoiced, paid and owed, and finds the last report", () => {
    const s = retailerSummary({
      retailer: retailer(),
      balances: [balance({ held: 3 }), balance({ batch_line_id: "b9", sent_on: "2026-05-20", held: 1 })],
      docs: [
        doc(),
        doc({ id: "d2", period: "2026-09", number: "CBR/26-27/0000", consignment_lines: [line({ quantity: 2, unit_price_paise: 75000 })] }),
        doc({ id: "d3", status: "cancelled", period: "2026-08" }),
        doc({ id: "d4", status: "draft", number: null, period: "2026-11" }),
        doc({ id: "d5", kind: "challan", period: null, number: "CBC/26-27/0001" }),
      ],
      payments: [payment({ amount_paise: 100000 })],
      today: TODAY,
    });
    expect(s).toEqual({
      unitsHeld: 4,
      mrpValueHeldPaise: 400000,
      invoicedPaise: 75000 + 150000,
      paidPaise: 100000,
      owedPaise: 125000,
      lastReportedPeriod: "2026-10",
      amberBatches: 1,
      redBatches: 0,
      oldestSentOn: "2026-05-20",
    });
  });
});
