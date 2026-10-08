import { describe, expect, it } from "vitest";
import readExcelFile from "read-excel-file/node";
import { balance } from "./__fixtures__/retail";
import { holdingsFrom } from "./holdings";
import { ABOUT_SHEET, buildSalesSheet, parseSalesSheet, SALES_COLUMNS, SALES_SHEET, salesSheetFileName, TEMPLATE_ID, type ParsedSheet } from "./sheet";

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
const expected = { shop: SHOP, month: MONTH, holdings: HOLDINGS };

function sheets(rows: unknown[][], about?: unknown[][]): ParsedSheet[] {
  return [
    { sheet: SALES_SHEET, data: [[...SALES_COLUMNS], ...rows] as ParsedSheet["data"] },
    { sheet: ABOUT_SHEET, data: (about ?? [["Shop", SHOP.name], ["Shop id", SHOP.id], ["Month", MONTH], ["Template", TEMPLATE_ID]]) as ParsedSheet["data"] },
  ];
}

describe("buildSalesSheet", () => {
  it("writes one row per held size with a blank Sold column, and an About sheet", async () => {
    const book = await readExcelFile(await buildSalesSheet(expected));
    const sales = book.find((s) => s.sheet === SALES_SHEET)!.data;
    expect(sales[0]).toEqual([...SALES_COLUMNS]);
    expect(sales.slice(1)).toEqual([
      ["bloom-romper-0-3m", "Bloom Romper", "0-3M", 1000, 2, null],
      ["petal-frock-1-2y", "Petal Pops Frock", "1-2Y", "1,000.00 / 1,100.00", 4, null],
    ]);
    const about = book.find((s) => s.sheet === ABOUT_SHEET)!.data;
    expect(about).toContainEqual(["Shop id", SHOP.id]);
    expect(about).toContainEqual(["Month", MONTH]);
    expect(about).toContainEqual(["Template", TEMPLATE_ID]);
  });

  it("round-trips: an untouched download parses as nothing sold", async () => {
    const book = await readExcelFile(await buildSalesSheet(expected));
    expect(parseSalesSheet(book as ParsedSheet[], expected)).toEqual({ ok: true, lines: [] });
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
    expect(r).toEqual({ ok: true, lines: [{ variant_slug: "petal-frock-1-2y", quantity: 3 }, { variant_slug: "bloom-romper-0-3m", quantity: 1 }] });
  });

  it("reports each bad row with its spreadsheet row number", () => {
    const r = parseSalesSheet(
      sheets([
        ["petal-frock-1-2y", "", "", null, null, 2.5],
        ["bloom-romper-0-3m", "", "", null, null, -1],
        ["ghost-code", "", "", null, null, 1],
        [null, "", "", null, null, 3],
        ["ghost-zero", "", "", null, null, 0],
      ]),
      expected,
    );
    expect(r).toEqual({
      ok: false,
      rowErrors: [
        { row: 2, code: "petal-frock-1-2y", message: 'Sold must be a whole number of pieces (found "2.5")' },
        { row: 3, code: "bloom-romper-0-3m", message: 'Sold must be a whole number of pieces (found "-1")' },
        { row: 4, code: "ghost-code", message: "ghost-code is not stock this shop holds" },
        { row: 5, code: "", message: "This row has a quantity but no code" },
      ],
    });
  });

  it("refuses selling more than the shop holds, at the code's first row", () => {
    const r = parseSalesSheet(sheets([["bloom-romper-0-3m", "", "", null, null, 2], ["bloom-romper-0-3m", "", "", null, null, 1]]), expected);
    expect(r).toEqual({ ok: false, rowErrors: [{ row: 2, code: "bloom-romper-0-3m", message: "Sold 3 of Bloom Romper (0-3M) but the shop holds 2" }] });
  });

  it("refuses a sheet for another shop or month, or with changed columns", () => {
    const wrong = "Please use the sheet downloaded for Kids Corner, Oct 2026";
    expect(parseSalesSheet(sheets([], [["Shop id", "other"], ["Month", MONTH], ["Template", TEMPLATE_ID]]), expected)).toEqual({ ok: false, fileError: wrong });
    expect(parseSalesSheet(sheets([], [["Shop id", SHOP.id], ["Month", "2026-09"], ["Template", TEMPLATE_ID]]), expected)).toEqual({ ok: false, fileError: wrong });
    expect(parseSalesSheet([{ sheet: "Sheet1", data: [] }], expected)).toEqual({ ok: false, fileError: wrong });
    const renamed = sheets([]);
    renamed[0].data[0] = ["Code", "Product", "Size", "MRP", "You hold", "Sold"];
    expect(parseSalesSheet(renamed, expected)).toEqual({ ok: false, fileError: `${wrong}. Its column headings were changed.` });
  });
});
