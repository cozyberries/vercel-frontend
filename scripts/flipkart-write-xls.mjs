#!/usr/bin/env node
// Fill the Flipkart template directly from a generated TSV and write an
// upload-ready workbook. Usage:
//   npm run flipkart:write
//   npm run flipkart:write -- --out=exports/flipkart/upload.xls
//
// Why this exists: pasting the TSV by hand put every value one column right of
// where it belonged (ACTIVE landed in MRP, the HSN in Luxury Cess), and QC
// rejected all 68 rows for errors that were purely alignment. Writing the cells
// at explicit column indices removes that failure mode entirely.
//
// The written file loses the template's data-validation dropdowns and colour
// coding — they are authoring aids, not upload requirements, and this template
// ships no macro to lose. Header rows 1-4 are copied through untouched.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import {
  COLUMN_COUNT,
  COLUMNS,
  columnIndex,
  FIRST_SELLER_COLUMN,
  layoutForTemplate,
} from "../lib/flipkart/columns.ts";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "1"];
  }),
);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = path.resolve(
  REPO_ROOT,
  args.template ??
    "exports/flipkart/C_kids-apparel-combo_6b8552c31ff94c26_1509-1426FK_REQHJLTV8OLHY.xlsx",
);
const TSV = path.resolve(REPO_ROOT, args.tsv ?? "exports/flipkart/kids-apparel-combo.tsv");
// Default to .xlsx. Three uploads of a SheetJS-written BIFF8 .xls came back
// mangled three different ways — values one column right, two values fused into
// one cell, values one column left — while xlrd read the same files correctly
// every time. The legacy writer is the variable; xlsx is a far better specified
// format and the one part of this pipeline not yet tried.
const OUT = path.resolve(REPO_ROOT, args.out ?? "exports/flipkart/kids-apparel-combo-upload.xlsx");
const SHEET = "kids_apparel_combo";
const FIRST_DATA_ROW = 4; // zero-based; spreadsheet row 5
const PASTE_FROM_INDEX = FIRST_SELLER_COLUMN;

/** Columns Flipkart reads as numbers — written as numbers, not text. */
const NUMERIC_NAMES = new Set(
  [
    "MRP (INR)",
    "Your selling price (INR)",
    "Stock",
    "Procurement SLA (DAY)",
    "Local handling fee (INR)",
    "Zonal handling fee (INR)",
    "National handling fee (INR)",
    "Length (CM)",
    "Breadth (CM)",
    "Height (CM)",
    "Weight (KG)",
    "Minimum Order Quantity (MinOQ)",
    "Number of Apparel Combo",
  ],
);

async function main() {
  const book = XLSX.readFile(TEMPLATE);
  const sheet = book.Sheets[SHEET];
  if (!sheet) throw new Error(`Sheet ${SHEET} not found in ${TEMPLATE}`);

  // Read the target template's own header row and place values by name. The
  // template is reissued with columns inserted (13 Sep: 69 columns, unlabelled
  // one at 8; 15 Sep: 70, "Parent Variant FSN" at 8), so position is resolved
  // here, at run time, rather than baked into this repo.
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  // Trim trailing unnamed columns: a file Flipkart has annotated carries ~257
  // columns, almost all empty. The real layout ends at the last named header.
  // Trim at the last column we recognise. A file Flipkart has annotated carries
  // ~255 columns, and the ones past the real layout are noise we must not write
  // into. "Supplier Image" is the last column of the actual template.
  const rawHeader = (grid[0] ?? []).map((h) => String(h ?? "").trim());
  const knownNames = new Set(COLUMNS.map((c) => c.name).filter(Boolean));
  let last = -1;
  rawHeader.forEach((name, i) => {
    if (knownNames.has(name)) last = i;
  });
  if (last < 0) throw new Error("Template header has none of the expected columns");
  const targetHeader = rawHeader.slice(0, last + 1);
  const targetWidth = targetHeader.length;

  const known = new Set(COLUMNS.map((c) => c.name).filter(Boolean));
  const unknown = targetHeader.filter((n) => n && !known.has(n));
  const missing = [...known].filter((n) => !targetHeader.includes(n));
  if (missing.length) {
    throw new Error(
      `Template is missing columns this exporter fills: ${missing.join(", ")}`,
    );
  }
  if (unknown.length) {
    console.log(`Note: template has columns we do not fill: ${unknown.join(", ")}`);
  }

  const rows = (await readFile(TSV, "utf8"))
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.split("\t"));

  // The TSV is generated FOR this template, so its field count follows the
  // template, not this repo's own column spec.
  const expectedWidth = targetWidth - FIRST_SELLER_COLUMN;
  rows.forEach((cells, i) => {
    if (cells.length !== expectedWidth) {
      throw new Error(`TSV row ${i + 1} has ${cells.length} fields, expected ${expectedWidth}`);
    }
  });

  // Clear every existing data row, so stale draft rows can't survive underneath.
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  for (let r = FIRST_DATA_ROW; r <= Math.max(range.e.r, FIRST_DATA_ROW + rows.length); r++) {
    for (let c = 0; c < targetWidth; c++) {
      delete sheet[XLSX.utils.encode_cell({ r, c })];
    }
  }

  rows.forEach((cells, i) => {
    const r = FIRST_DATA_ROW + i;
    // Write EVERY column, including the empty ones and the Flipkart-owned A-F,
    // as explicit cells. The template ships empty-but-present cells, and
    // omitting them leaves gaps in the row's cell records — Flipkart's parser
    // walks those sequentially, so a gap shifts every later value. That is what
    // put ACTIVE into the MRP column and read back as "ACTIVE1039".
    // The TSV already carries this template's layout (flipkart-export.mjs maps
    // by header name), so field f belongs at column 6 + f. Columns A-F are
    // Flipkart's and stay empty.
    const laid = targetHeader.map((_, c) => {
      const f = c - FIRST_SELLER_COLUMN;
      return f >= 0 && f < cells.length ? cells[f] : "";
    });
    laid.forEach((value, c) => {
      const numeric = NUMERIC_NAMES.has(targetHeader[c]);
      const address = XLSX.utils.encode_cell({ r, c });
      sheet[address] =
        value !== "" && numeric && !Number.isNaN(Number(value))
          ? { t: "n", v: Number(value) }
          : { t: "s", v: value };
    });
  });

  // Trim the range to exactly what we wrote — the template declares 500 rows,
  // and trailing phantom rows have shown up as duplicate SKUs downstream.
  sheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: FIRST_DATA_ROW + rows.length - 1, c: targetWidth - 1 },
  });

  // Drop metadata inherited from the legacy .xls. SheetJS re-emits the
  // template's column dimensions with attributes that openpyxl refuses to
  // parse ("ColumnDimension.__init__() got an unexpected keyword argument
  // 'level'"), and a file a strict parser cannot read is a file Flipkart's
  // parser may also misread. None of it is needed to carry the data.
  for (const key of ["!cols", "!rows", "!merges", "!protect", "!autofilter"]) {
    delete sheet[key];
  }
  for (const address of Object.keys(sheet)) {
    if (address.startsWith("!")) continue;
    delete sheet[address].s; // style reference into the old workbook
  }

  await mkdir(path.dirname(OUT), { recursive: true });
  const bookType = OUT.endsWith(".xlsx") ? "xlsx" : "biff8";
  XLSX.writeFile(book, OUT, { bookType });

  console.log(`Wrote ${rows.length} row(s) into ${path.relative(REPO_ROOT, OUT)}`);
  console.log(
    `Sheet ${SHEET}, ${targetWidth} columns, data in rows ${FIRST_DATA_ROW + 1}-${
      FIRST_DATA_ROW + rows.length
    }.`,
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
