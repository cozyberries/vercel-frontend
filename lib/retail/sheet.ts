import writeExcelFile, { type Row, type SheetData } from "write-excel-file/node";
import { monthLabel } from "@/lib/gst/register-month";
import type { Holding } from "./holdings";
import { formatRate } from "./pricing";
import type { RowError } from "./types";

/** Server-only: the monthly sales sheet a shop fills in, and the parser for the filled copy. */
export const SALES_SHEET = "Sales";
export const ABOUT_SHEET = "About";
export const TEMPLATE_ID = "cozyberries-retail-sales-v2";
export const BASE_COLUMNS = ["Code (do not edit)", "Product", "Size", "MRP", "You hold"] as const;
const FULL_PRICE = "Sold at full MRP";
const FIRST_SOLD = BASE_COLUMNS.length;

/** The Sales sheet headings for a month with these approved rates (ascending). */
export function salesColumns(rates: number[]): string[] {
  return [...BASE_COLUMNS, FULL_PRICE, ...rates.map((r) => `Sold at ${formatRate(r)}% off`)];
}

/** "10%, 12.5%", or "None": the About sheet's Discounts row. */
export function ratesLabel(rates: number[]): string {
  return rates.length ? rates.map((r) => `${formatRate(r)}%`).join(", ") : "None";
}

export interface SheetShop {
  id: string;
  name: string;
}

export type Cell = string | number | boolean | Date | null;
export interface ParsedSheet {
  sheet: string;
  data: Cell[][];
}
export interface SheetLine {
  variant_slug: string;
  quantity: number;
  /** 0 = full MRP. */
  discount_pct: number;
}
export type ParseResult =
  | { ok: true; lines: SheetLine[] }
  | { ok: false; fileError: string; rowErrors?: undefined }
  | { ok: false; rowErrors: RowError[]; fileError?: undefined };

// Every text cell is typed String, so a value starting with "=" is stored as text, never as a formula.
const text = (value: string) => ({ value, type: String });
const head = (labels: readonly string[]): Row => labels.map((value) => ({ value, fontWeight: "bold" as const }));
const RUPEES = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function mrpCell(h: Holding) {
  const mrps = [...new Set(h.batches.map((b) => b.mrp_paise))].sort((a, b) => a - b);
  if (mrps.length === 1) return { value: mrps[0] / 100, type: Number, format: "#,##0.00" };
  return text(mrps.map((p) => RUPEES.format(p / 100)).join(" / "));
}

export async function buildSalesSheet({ shop, month, holdings, rates }: { shop: SheetShop; month: string; holdings: Holding[]; rates: number[] }): Promise<Buffer> {
  const columns = salesColumns(rates);
  const blanks = columns.slice(FIRST_SOLD).map(() => null);
  const sales: SheetData = [
    head(columns),
    ...holdings.map((h) => [text(h.variantSlug), text(h.productName), text(h.size), mrpCell(h), { value: h.held, type: Number }, ...blanks]),
  ];
  const how = rates.length
    ? `Type how many pieces of each size sold in ${monthLabel(month)}: at full MRP in "${FULL_PRICE}", and at an approved discount in its "Sold at …% off" column. Leave a cell blank if none sold.`
    : `Type how many pieces of each size sold in ${monthLabel(month)} in the "${FULL_PRICE}" column of the Sales sheet. Leave it blank if none sold.`;
  const about: SheetData = [
    [text("Shop"), text(shop.name)],
    [text("Shop id"), text(shop.id)],
    [text("Month"), text(month)],
    [text("Template"), text(TEMPLATE_ID)],
    [text("Discounts"), text(ratesLabel(rates))],
    [],
    [text("How to fill"), text(how)],
    [text("Do not edit"), text("This sheet, the codes, or any column heading. Send the file back as it is.")],
  ];
  return writeExcelFile([
    {
      sheet: SALES_SHEET,
      data: sales,
      columns: [{ width: 30 }, { width: 36 }, { width: 10 }, { width: 18 }, { width: 10 }, ...blanks.map(() => ({ width: 18 }))],
      stickyRowsCount: 1,
    },
    { sheet: ABOUT_SHEET, data: about, columns: [{ width: 14 }, { width: 90 }] },
  ]).toBuffer();
}

export function salesSheetFileName(shopName: string, month: string): string {
  const slug = shopName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `cozyberries-sales-${slug || "shop"}-${month}.xlsx`;
}

type Sold = { kind: "blank" } | { kind: "ok"; value: number } | { kind: "bad" };

function parseSold(cell: Cell | undefined): Sold {
  if (cell === null || cell === undefined) return { kind: "blank" };
  if (typeof cell === "number") return Number.isInteger(cell) && cell >= 0 ? { kind: "ok", value: cell } : { kind: "bad" };
  if (typeof cell === "string") {
    const t = cell.trim();
    if (t === "") return { kind: "blank" };
    if (/^\d+(\.0+)?$/.test(t)) return { kind: "ok", value: Number(t) };
  }
  return { kind: "bad" };
}

const str = (cell: Cell | undefined) => (cell === null || cell === undefined ? "" : String(cell).trim());

export function parseSalesSheet(
  sheets: ParsedSheet[],
  expected: { shop: SheetShop; month: string; holdings: Pick<Holding, "variantSlug" | "held" | "productName" | "size">[]; rates: number[] },
): ParseResult {
  const wrongFile = `Please use the sheet downloaded for ${expected.shop.name}, ${monthLabel(expected.month)}`;
  const about = sheets.find((s) => s.sheet === ABOUT_SHEET);
  const sales = sheets.find((s) => s.sheet === SALES_SHEET);
  if (!about || !sales) return { ok: false, fileError: wrongFile };

  const meta = new Map(about.data.map((r) => [str(r[0]), str(r[1])] as const));
  if (meta.get("Template") !== TEMPLATE_ID || meta.get("Shop id") !== expected.shop.id || meta.get("Month") !== expected.month) {
    return { ok: false, fileError: wrongFile };
  }
  if (meta.get("Discounts") !== ratesLabel(expected.rates)) {
    return { ok: false, fileError: `The discount rates for ${monthLabel(expected.month)} changed after this sheet was downloaded. Download it again.` };
  }
  const columns = salesColumns(expected.rates);
  const header = (sales.data[0] ?? []).map(str);
  if (columns.some((label, i) => header[i] !== label) || header.slice(columns.length).some((h) => h !== "")) {
    return { ok: false, fileError: `${wrongFile}. Its column headings were changed.` };
  }
  const soldRates = [0, ...expected.rates];

  const held = new Map(expected.holdings.map((h) => [h.variantSlug, h]));
  const totals = new Map<string, { quantity: number; firstRow: number; byRate: number[] }>();
  const errors: RowError[] = [];

  sales.data.slice(1).forEach((r, i) => {
    const row = i + 2;
    const code = str(r[0]);
    const stray = r.findIndex((cell, c) => c >= columns.length && str(cell) !== "");
    if (stray >= 0) {
      errors.push({ row, code, message: `This row has a value in column ${stray + 1} (no heading). Put sales only in the Sold columns` });
      return;
    }
    const counts: number[] = [];
    for (let k = 0; k < soldRates.length; k++) {
      const cell = r[FIRST_SOLD + k];
      const sold = parseSold(cell);
      if (sold.kind === "bad") {
        errors.push({ row, code, message: `${columns[FIRST_SOLD + k]} must be a whole number of pieces (found "${str(cell)}")` });
        return;
      }
      counts.push(sold.kind === "ok" ? sold.value : 0);
    }
    const quantity = counts.reduce((a, b) => a + b, 0);
    if (!code) {
      if (quantity > 0) errors.push({ row, code: "", message: "This row has a quantity but no code" });
      return;
    }
    if (!held.has(code)) {
      if (quantity > 0) errors.push({ row, code, message: `${code} is not stock this shop holds` });
      return;
    }
    const t = totals.get(code);
    if (t) {
      t.quantity += quantity;
      counts.forEach((c, k) => (t.byRate[k] += c));
    } else {
      totals.set(code, { quantity, firstRow: row, byRate: counts });
    }
  });

  for (const [code, t] of totals) {
    const h = held.get(code)!;
    if (t.quantity > h.held) {
      errors.push({ row: t.firstRow, code, message: `Sold ${t.quantity} of ${h.productName} (${h.size}) but the shop holds ${h.held}` });
    }
  }
  if (errors.length) return { ok: false, rowErrors: errors.sort((a, b) => a.row - b.row) };
  return {
    ok: true,
    lines: [...totals].flatMap(([variant_slug, t]) =>
      t.byRate.flatMap((quantity, k) => (quantity > 0 ? [{ variant_slug, quantity, discount_pct: soldRates[k] }] : [])),
    ),
  };
}
