import { describe, expect, it } from "vitest";
import readExcelFile from "read-excel-file/node";
import { balance } from "./__fixtures__/retail";
import { holdingsFrom } from "./holdings";
import { ABOUT_SHEET, buildSalesSheet, parseSalesSheet, ratesLabel, SALES_SHEET, salesColumns, salesSheetFileName, TEMPLATE_ID, type ParsedSheet } from "./sheet";

const SHOP = { id: "11111111-1111-4111-8111-111111111111", name: "Kids Corner" };
const MONTH = "2026-10";
const HOLDINGS = holdingsFrom(
  [
    balance({ held: 3 }),
    balance({ batch_line_id: "b2", mrp_paise: 110000, held: 1, sent_on: "2026-10-05" }),
    balance({ batch_line_id: "c1", variant_slug: "bloom-romper-0-3m", product_name: "Bloom Romper", size: "0-3M", held: 2 }),
  ],
  "2026-10-31",
);
const expected = { shop: SHOP, month: MONTH, holdings: HOLDINGS, rates: [] as number[] };
const withRates = { ...expected, rates: [10, 12.5] };

function about(rates: number[], over: unknown[][] = []): unknown[][] {
  return over.length ? over : [["Shop", SHOP.name], ["Shop id", SHOP.id], ["Month", MONTH], ["Template", TEMPLATE_ID], ["Discounts", ratesLabel(rates)]];
}
function sheets(rows: unknown[][], rates: number[] = [], aboutRows?: unknown[][]): ParsedSheet[] {
  return [
    { sheet: SALES_SHEET, data: [salesColumns(rates), ...rows] as ParsedSheet["data"] },
    { sheet: ABOUT_SHEET, data: about(rates, aboutRows) as ParsedSheet["data"] },
  ];
}

describe("salesColumns", () => {
  it("adds one column per approved rate after full MRP", () => {
    expect(salesColumns([])).toEqual(["Code (do not edit)", "Product", "Size", "MRP", "You hold", "Sold at full MRP"]);
    expect(salesColumns([10, 12.5]).slice(5)).toEqual(["Sold at full MRP", "Sold at 10% off", "Sold at 12.5% off"]);
    expect(ratesLabel([10, 12.5])).toBe("10%, 12.5%");
    expect(ratesLabel([])).toBe("None");
  });
});

describe("buildSalesSheet", () => {
  it("writes one row per held size with blank Sold columns, and an About sheet with the discounts", async () => {
    const book = await readExcelFile(await buildSalesSheet(withRates));
    const sales = book.find((s) => s.sheet === SALES_SHEET)!.data;
    expect(sales[0]).toEqual(salesColumns([10, 12.5]));
    expect(sales.slice(1)).toEqual([
      ["bloom-romper-0-3m", "Bloom Romper", "0-3M", 1000, 2, null, null, null],
      ["petal-frock-1-2y", "Petal Pops Frock", "1-2Y", "1,000.00 / 1,100.00", 4, null, null, null],
    ]);
    const aboutRows = book.find((s) => s.sheet === ABOUT_SHEET)!.data;
    expect(aboutRows).toContainEqual(["Shop id", SHOP.id]);
    expect(aboutRows).toContainEqual(["Month", MONTH]);
    expect(aboutRows).toContainEqual(["Template", TEMPLATE_ID]);
    expect(aboutRows).toContainEqual(["Discounts", "10%, 12.5%"]);
  });

  it("round-trips: an untouched download parses as nothing sold", async () => {
    const book = await readExcelFile(await buildSalesSheet(withRates));
    expect(parseSalesSheet(book as ParsedSheet[], withRates)).toEqual({ ok: true, lines: [] });
  });

  it("names the file after the shop and month", () => {
    expect(salesSheetFileName("Kids Corner & Co.", "2026-10")).toBe("cozyberries-sales-kids-corner-co-2026-10.xlsx");
  });
});

describe("parseSalesSheet", () => {
  it("reads numbers, numeric text and blanks, and sums repeated codes", () => {
    const r = parseSalesSheet(
      sheets([
        ["petal-frock-1-2y", "Petal Pops Frock", "1-2Y", 1000, 4, 2],
        ["bloom-romper-0-3m", "Bloom Romper", "0-3M", 1000, 2, " 1 "],
        ["petal-frock-1-2y", "", "", null, null, "1.0"],
        ["bloom-romper-0-3m", "Bloom Romper", "0-3M", 1000, 2],
        [null, null, null, null, null, null],
      ]),
      expected,
    );
    expect(r).toEqual({
      ok: true,
      lines: [
        { variant_slug: "petal-frock-1-2y", quantity: 3, discount_pct: 0 },
        { variant_slug: "bloom-romper-0-3m", quantity: 1, discount_pct: 0 },
      ],
    });
  });

  it("returns one line per product and rate", () => {
    const r = parseSalesSheet(sheets([["petal-frock-1-2y", "", "", null, null, 1, 2, null], ["bloom-romper-0-3m", "", "", null, null, null, null, 1]], [10, 12.5]), withRates);
    expect(r).toEqual({
      ok: true,
      lines: [
        { variant_slug: "petal-frock-1-2y", quantity: 1, discount_pct: 0 },
        { variant_slug: "petal-frock-1-2y", quantity: 2, discount_pct: 10 },
        { variant_slug: "bloom-romper-0-3m", quantity: 1, discount_pct: 12.5 },
      ],
    });
  });

  it("checks held against the total across rate columns", () => {
    const r = parseSalesSheet(sheets([["bloom-romper-0-3m", "", "", null, null, 1, 1, 1]], [10, 12.5]), withRates);
    expect(r).toEqual({ ok: false, rowErrors: [{ row: 2, code: "bloom-romper-0-3m", message: "Sold 3 of Bloom Romper (0-3M) but the shop holds 2" }] });
  });

  it("reports each bad row with its spreadsheet row number and column", () => {
    const r = parseSalesSheet(
      sheets(
        [
          ["petal-frock-1-2y", "", "", null, null, 2.5, null],
          ["bloom-romper-0-3m", "", "", null, null, null, -1],
          ["ghost-code", "", "", null, null, 1, null],
          [null, "", "", null, null, null, 3],
          ["ghost-zero", "", "", null, null, 0, null],
        ],
        [10],
      ),
      { ...expected, rates: [10] },
    );
    expect(r).toEqual({
      ok: false,
      rowErrors: [
        { row: 2, code: "petal-frock-1-2y", message: 'Sold at full MRP must be a whole number of pieces (found "2.5")' },
        { row: 3, code: "bloom-romper-0-3m", message: 'Sold at 10% off must be a whole number of pieces (found "-1")' },
        { row: 4, code: "ghost-code", message: "ghost-code is not stock this shop holds" },
        { row: 5, code: "", message: "This row has a quantity but no code" },
      ],
    });
  });

  it("refuses selling more than the shop holds, at the code's first row", () => {
    const r = parseSalesSheet(sheets([["bloom-romper-0-3m", "", "", null, null, 2], ["bloom-romper-0-3m", "", "", null, null, 1]]), expected);
    expect(r).toEqual({ ok: false, rowErrors: [{ row: 2, code: "bloom-romper-0-3m", message: "Sold 3 of Bloom Romper (0-3M) but the shop holds 2" }] });
  });

  it("refuses a sheet for another shop or month, an old template, or changed columns", () => {
    const wrong = "Please use the sheet downloaded for Kids Corner, Oct 2026";
    expect(parseSalesSheet(sheets([], [], [["Shop id", "other"], ["Month", MONTH], ["Template", TEMPLATE_ID], ["Discounts", "None"]]), expected)).toEqual({ ok: false, fileError: wrong });
    expect(parseSalesSheet(sheets([], [], [["Shop id", SHOP.id], ["Month", "2026-09"], ["Template", TEMPLATE_ID], ["Discounts", "None"]]), expected)).toEqual({ ok: false, fileError: wrong });
    expect(parseSalesSheet(sheets([], [], [["Shop id", SHOP.id], ["Month", MONTH], ["Template", "cozyberries-retail-sales-v1"]]), expected)).toEqual({ ok: false, fileError: wrong });
    expect(parseSalesSheet([{ sheet: "Sheet1", data: [] }], expected)).toEqual({ ok: false, fileError: wrong });
    const renamed = sheets([]);
    renamed[0].data[0] = ["Code", "Product", "Size", "MRP", "You hold", "Sold"];
    expect(parseSalesSheet(renamed, expected)).toEqual({ ok: false, fileError: `${wrong}. Its column headings were changed.` });
  });

  it("refuses a sheet whose discounts changed after it was downloaded", () => {
    const msg = "The discount rates for Oct 2026 changed after this sheet was downloaded. Download it again.";
    // Downloaded with 10%, and 10% was then removed.
    expect(parseSalesSheet(sheets([], [10]), expected)).toEqual({ ok: false, fileError: msg });
    // Downloaded with none, and 10% was then added.
    expect(parseSalesSheet(sheets([], []), { ...expected, rates: [10] })).toEqual({ ok: false, fileError: msg });
  });
});
