import { describe, expect, it } from "vitest";
import { line } from "./__fixtures__/retail";
import { docTotalPaise, formatRate, mrpValueOf, piecesOf, priceSaleLines, ratesFor, retailGst, unitPricePaise } from "./pricing";

describe("retail pricing", () => {
  it("prices our share of MRP to the paisa, rounding half up once", () => {
    expect(unitPricePaise(100000, 75)).toBe(75000);
    expect(unitPricePaise(99950, 75)).toBe(74963);
    expect(unitPricePaise(110000, 70)).toBe(77000);
  });

  it("merges batches with the same MRP and keeps different MRPs apart", () => {
    const priced = priceSaleLines(
      [
        line({ id: "a", quantity: 1, mrp_paise: 100000 }),
        line({ id: "b", quantity: 2, mrp_paise: 100000 }),
        line({ id: "c", quantity: 1, mrp_paise: 110000 }),
      ],
      75,
    );
    expect(priced.map((p) => [p.description, p.quantity, p.mrpPaise, p.unitPricePaise])).toEqual([
      ["Petal Pops Frock (1-2Y)", 3, 100000, 75000],
      ["Petal Pops Frock (1-2Y)", 1, 110000, 82500],
    ]);
  });

  it("uses the stored unit price of an issued line over the share", () => {
    const [p] = priceSaleLines([line({ unit_price_paise: 77000, mrp_paise: 110000 })], 75);
    expect(p.unitPricePaise).toBe(77000);
  });

  it("splits GST out of Rs 750: Rs 714.29 + CGST 17.85 + SGST 17.86 in Karnataka", () => {
    const gst = retailGst(priceSaleLines([line()], 75), "29");
    expect(gst.mode).toBe("intra");
    expect(gst.totals).toEqual({ taxablePaise: 71429, cgstPaise: 1785, sgstPaise: 1786, igstPaise: 0, discountPaise: 0, totalPaise: 75000 });
  });

  it("charges IGST to a shop in another state", () => {
    const gst = retailGst(priceSaleLines([line()], 75), "33");
    expect(gst.mode).toBe("inter");
    expect(gst.totals.igstPaise).toBe(3571);
  });

  it("totals a document, counts pieces and MRP value", () => {
    const d = { share_pct: 75, consignment_lines: [line({ quantity: 2 }), line({ quantity: 1, mrp_paise: 110000 })] };
    expect(docTotalPaise(d, 70)).toBe(150000 + 82500);
    expect(docTotalPaise({ ...d, share_pct: null }, 70)).toBe(140000 + 77000);
    expect(piecesOf(d)).toBe(3);
    expect(mrpValueOf(d)).toBe(310000);
  });

  it("prices our share of the selling price: MRP less the approved discount", () => {
    expect(unitPricePaise(92300, 75, 10)).toBe(62303);
    expect(unitPricePaise(92300, 75, 20)).toBe(55380);
    expect(unitPricePaise(92300, 75, 12.5)).toBe(60572);
  });

  it("keeps the old price at rate 0", () => {
    expect(unitPricePaise(92300, 75, 0)).toBe(unitPricePaise(92300, 75));
    expect(unitPricePaise(92300, 75)).toBe(69225);
  });

  it("keeps lines at different discounts apart and carries the rate", () => {
    const priced = priceSaleLines(
      [
        line({ id: "a", quantity: 2, mrp_paise: 92300 }),
        line({ id: "b", quantity: 1, mrp_paise: 92300, discount_pct: 10 }),
        line({ id: "c", quantity: 1, mrp_paise: 92300, discount_pct: 10 }),
      ],
      75,
    );
    expect(priced.map((p) => [p.quantity, p.discountPct, p.unitPricePaise])).toEqual([
      [2, 0, 69225],
      [2, 10, 62303],
    ]);
  });

  it("totals a draft at its lines' discounts", () => {
    const d = { share_pct: null, consignment_lines: [line({ mrp_paise: 92300, discount_pct: 10, quantity: 2 })] };
    expect(docTotalPaise(d, 75)).toBe(2 * 62303);
  });

  it("formats rates without trailing zeros and lists a month's rates in order", () => {
    expect(formatRate(10)).toBe("10");
    expect(formatRate(12.5)).toBe("12.5");
    expect(formatRate(7.25)).toBe("7.25");
    const rates = [
      { period: "2026-10", rate_pct: 20 },
      { period: "2026-09", rate_pct: 5 },
      { period: "2026-10", rate_pct: 10 },
    ];
    expect(ratesFor(rates, "2026-10")).toEqual([10, 20]);
    expect(ratesFor(rates, "2026-08")).toEqual([]);
  });
});
