#!/usr/bin/env node
// Validate a generated Flipkart TSV before pasting it into the template.
//   npm run flipkart:validate
//   npm run flipkart:validate -- --file=exports/flipkart/kids-apparel-combo.tsv
//
// This exists because the template's Summary sheet documents a CTRL+SHIFT+S
// "Fast Validate" macro that the downloaded file does not actually contain —
// it has no _VBA_PROJECT stream at all, on any platform. These checks are the
// replacement, run against the same vocabularies Flipkart's dropdowns define.
//
// Exits non-zero if anything would fail QC, so it can gate an upload.

import { readFile } from "node:fs/promises";
import XLSX from "xlsx";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COLUMNS,
  COLUMN_COUNT,
  columnIndex,
  FIRST_SELLER_COLUMN,
} from "../lib/flipkart/columns.ts";
import { MAX_GROUP_ID_LENGTH } from "../lib/flipkart/mapping.ts";
import {
  BRAND_SIZE,
  CHARACTER,
  COUNTRY_OF_ORIGIN,
  FABRIC,
  FABRIC_CARE,
  FULFILMENT_BY,
  LISTING_STATUS,
  PROCUREMENT_TYPE,
  IDEAL_FOR,
  NUMBER_OF_APPAREL_COMBO,
  OCCASION,
  ORNAMENTATION_TYPE,
  PATTERN,
  PATTERN_PRINT_TYPE,
  PRIMARY_COLOR,
  PRIMARY_PRODUCT_TYPE,
  SECONDARY_PRODUCT_TYPE,
  SLEEVE_LENGTH,
  TAX_CODE,
} from "../lib/flipkart/enums.ts";

const MULTI = "::";
const SHEET = "kids_apparel_combo";
const FIRST_DATA_ROW = 4;
const MAX_SKU_LENGTH = 64;

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "1"];
  }),
);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.resolve(REPO_ROOT, args.file ?? "exports/flipkart/kids-apparel-combo.tsv");
/** "upload" (what we generate) or "template" (a file Flipkart echoed back). */
const LAYOUT = args.layout ?? "upload";
/** Optional: the template a TSV was generated for, so fields map back by name. */
const TEMPLATE = args.template ? path.resolve(REPO_ROOT, args.template) : null;

/** Header row of the target template, trimmed at the last column we recognise. */
function templateHeader(file) {
  const book = XLSX.readFile(file);
  const sheet = book.Sheets[SHEET];
  if (!sheet) throw new Error(`Sheet ${SHEET} not found in ${file}`);
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  const known = new Set(COLUMNS.map((c) => c.name).filter(Boolean));
  let last = -1;
  (grid[0] ?? []).forEach((h, i) => {
    if (known.has(String(h ?? "").trim())) last = i;
  });
  return (grid[0] ?? []).slice(0, last + 1).map((h) => String(h ?? "").trim());
}

/** Column name -> the vocabulary its value must belong to. */
const DROPDOWN_COLUMNS = {
  "Country Of Origin": COUNTRY_OF_ORIGIN,
  "Fullfilment by": FULFILMENT_BY,
  "Procurement type": PROCUREMENT_TYPE,
  "Listing Status": LISTING_STATUS,
  "Tax Code": TAX_CODE,
  "Ideal For": IDEAL_FOR,
  "Primary Product Type": PRIMARY_PRODUCT_TYPE,
  "Secondary Product Type": SECONDARY_PRODUCT_TYPE,
  Fabric: FABRIC,
  Pattern: PATTERN,
  Occasion: OCCASION,
  "Fabric Care": FABRIC_CARE,
  "Items Included": SECONDARY_PRODUCT_TYPE,
  "Brand Size": BRAND_SIZE,
  "Primary Color": PRIMARY_COLOR,
  "Pattern/Print Type": PATTERN_PRINT_TYPE,
  "Sleeve Length": SLEEVE_LENGTH,
  "Ornamentation Type": ORNAMENTATION_TYPE,
  Character: CHARACTER,
  "Number of Apparel Combo": NUMBER_OF_APPAREL_COMBO,
};

/** Columns Flipkart parses as a number; a stray letter fails QC silently. */
const NUMERIC_COLUMNS = [
  "MRP (INR)",
  "Your selling price (INR)",
  "Stock",
  "Procurement SLA (DAY)",
  "Length (CM)",
  "Breadth (CM)",
  "Height (CM)",
  "Weight (KG)",
  "Minimum Order Quantity (MinOQ)",
];

/**
 * Attributes Flipkart requires to be identical for every row sharing a Group
 * ID. It rejects the whole group otherwise, which is how all 68 rows failed.
 */
const GROUP_INVARIANT_COLUMNS = [
  "Ideal For",
  "Primary Product Type",
  "Secondary Product Type",
  "Brand",
  "Brand Color",
  "Primary Color",
  "Fabric",
  "Pattern",
  "Occasion",
  "Style Code",
  "Items Included",
];

/** First seller-editable column: "Seller SKU ID", spreadsheet column G. */
const PASTE_FROM_INDEX = columnIndex("Seller SKU ID");

/**
 * The export emits only the seller-editable columns (G onward), because A-F are
 * locked in the sheet. Every check below indexes against the full 69-column
 * layout, so a short row is padded back out with the blanks Flipkart fills in.
 */
export function normaliseWidth(cells) {
  if (cells.length === COLUMN_COUNT - FIRST_SELLER_COLUMN) {
    return [...Array(FIRST_SELLER_COLUMN).fill(""), ...cells];
  }
  return cells;
}

export function validateRows(rawRows) {
  const rows = rawRows.map(normaliseWidth);
  const errors = [];
  const warnings = [];
  const seenSku = new Map();
  const at = (r) => `row ${r + 1}`;

  const mandatory = COLUMNS.filter((c) => c.obligation === "mandatory");
  const skuCol = columnIndex("Seller SKU ID");
  const mrpCol = columnIndex("MRP (INR)");
  const sellCol = columnIndex("Your selling price (INR)");
  const imageCol = columnIndex("Main Image URL");

  rows.forEach((cells, r) => {
    if (cells.length !== COLUMN_COUNT) {
      const expected = COLUMN_COUNT - FIRST_SELLER_COLUMN;
      errors.push(
        `${at(r)}: has ${rawRows[r].length} columns, expected ${expected} (paste starts at G)`,
      );
      return; // every later check would be reading the wrong column
    }

    for (const col of mandatory) {
      if (cells[col.index].trim() === "") {
        errors.push(`${at(r)}: mandatory column "${col.name}" is empty`);
      }
    }

    for (const [name, allowed] of Object.entries(DROPDOWN_COLUMNS)) {
      const raw = cells[columnIndex(name)].trim();
      if (raw === "") continue; // emptiness is the mandatory check's business
      for (const value of raw.split(MULTI)) {
        if (!allowed.includes(value)) {
          errors.push(`${at(r)}: "${name}" = "${value}" is not one of its allowed values`);
        }
      }
    }

    for (const name of NUMERIC_COLUMNS) {
      const raw = cells[columnIndex(name)].trim();
      if (raw !== "" && !/^\d+(\.\d+)?$/.test(raw)) {
        errors.push(`${at(r)}: "${name}" = "${raw}" is not a plain number`);
      }
    }

    const sku = cells[skuCol].trim();
    if (sku.length > MAX_SKU_LENGTH) {
      errors.push(`${at(r)}: Seller SKU ID is ${sku.length} chars, over ${MAX_SKU_LENGTH}`);
    }
    if (seenSku.has(sku)) {
      errors.push(`${at(r)}: Seller SKU ID "${sku}" duplicates ${at(seenSku.get(sku))}`);
    }
    seenSku.set(sku, r);

    const mrp = Number(cells[mrpCol]);
    const sell = Number(cells[sellCol]);
    if (Number.isFinite(mrp) && Number.isFinite(sell) && sell > mrp) {
      errors.push(`${at(r)}: selling price ${sell} exceeds MRP ${mrp}`);
    }

    const image = cells[imageCol].trim();
    if (image && !/^https?:\/\//i.test(image)) {
      errors.push(`${at(r)}: Main Image URL "${image}" is not an absolute URL`);
    }

    const volumetric =
      (Number(cells[columnIndex("Length (CM)")]) *
        Number(cells[columnIndex("Breadth (CM)")]) *
        Number(cells[columnIndex("Height (CM)")])) /
      5000;
    const weight = Number(cells[columnIndex("Weight (KG)")]);
    if (Number.isFinite(volumetric) && Number.isFinite(weight) && volumetric > weight) {
      warnings.push(
        `${at(r)}: box bills as ${volumetric.toFixed(2)} kg volumetric but weighs ${weight} kg — ` +
          "you pay the larger figure on every shipment",
      );
    }
  });

  // Grouping rules. Flipkart rejected all 68 rows on these once already:
  // "Group Id should be less than 32" and "Grouping failed due to inconsistent
  // values for the following attributes: ideal_for".
  const groupCol = columnIndex("Group ID");
  const groups = new Map();
  rows.forEach((cells, r) => {
    if (cells.length !== COLUMN_COUNT) return;
    const id = cells[groupCol].trim();
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push({ r, cells });
  });

  for (const [id, members] of groups) {
    if (id.length >= MAX_GROUP_ID_LENGTH + 1) {
      errors.push(
        `group "${id}" is ${id.length} chars — Flipkart requires a Group ID under 32`,
      );
    }
    for (const name of GROUP_INVARIANT_COLUMNS) {
      const values = new Set(members.map((m) => m.cells[columnIndex(name)].trim()));
      if (values.size > 1) {
        errors.push(
          `group "${id}": "${name}" differs across its rows (${[...values].join(", ")}) — ` +
            "every row sharing a Group ID must agree on it",
        );
      }
    }
    // Flipkart: "Products with different brand_color values should have
    // different images." Same colour sharing images is fine; different colours
    // sharing them is what it rejects.
    const byColour = new Map();
    for (const m of members) {
      const colour = m.cells[columnIndex("Brand Color")].trim();
      const image = m.cells[columnIndex("Main Image URL")].trim();
      if (!byColour.has(image)) byColour.set(image, new Set());
      byColour.get(image).add(colour);
    }
    for (const [image, colours] of byColour) {
      if (colours.size > 1) {
        errors.push(
          `group "${id}": colours ${[...colours].join(", ")} share the image ${image} — ` +
            "different brand_color values need different images",
        );
      }
    }
  }

  return { errors, warnings };
}

/**
 * Read rows from either the generated TSV or a saved spreadsheet. Checking the
 * saved sheet is the point: the TSV has been correct every time, and it was the
 * paste into Excel that shifted every value one column right. Run this on the
 * file you are about to upload, not just on the file you copied from.
 */
async function readRows(file) {
  if (/\.xlsx?$/i.test(file)) {
    const book = XLSX.readFile(file);
    const sheet = book.Sheets[SHEET];
    if (!sheet) throw new Error(`Sheet ${SHEET} not found in ${file}`);
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
    const skuCol = columnIndex("Seller SKU ID");
    const data = grid
      .slice(FIRST_DATA_ROW)
      .filter((row) => String(row?.[skuCol] ?? "").trim() !== "");

    // Two layouts exist and they are one column apart, so the reader must be
    // told which it has. "upload" is what we write and what Flipkart's parser
    // expects: values contiguous from column 6, phantom column omitted.
    // "template" is the header layout Flipkart echoes errors back in.
    if (LAYOUT === "template") {
      return data.map((row) =>
        Array.from({ length: COLUMN_COUNT }, (_, c) => String(row[c] ?? "").trim()),
      );
    }
    // Resolve by header name: the sheet may be any template revision.
    const header = (grid[0] ?? []).map((h) => String(h ?? "").trim());
    return data.map((row) => {
      const cells = new Array(COLUMN_COUNT).fill("");
      COLUMNS.forEach((col) => {
        if (!col.name) return;
        const c = header.indexOf(col.name);
        if (c >= 0) cells[col.index] = String(row[c] ?? "").trim();
      });
      return cells;
    });
  }
  const tsv = (await readFile(file, "utf8"))
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.split("\t"));

  // With a template, map each field back to our internal indexing by the
  // template's own header name — the field count follows the template
  // (69-column sheet: 63 fields; 70-column: 64), so position alone is not
  // enough to know which attribute a field holds.
  if (TEMPLATE) {
    const header = templateHeader(TEMPLATE);
    return tsv.map((fields) => {
      const cells = new Array(COLUMN_COUNT).fill("");
      header.slice(FIRST_SELLER_COLUMN).forEach((name, f) => {
        if (!name) return;
        const col = COLUMNS.find((c) => c.name === name);
        if (col) cells[col.index] = (fields[f] ?? "").trim();
      });
      return cells;
    });
  }
  return tsv;
}

async function main() {
  const rows = await readRows(FILE);

  const { errors, warnings } = validateRows(rows);

  console.log(`Validated ${rows.length} row(s) from ${path.relative(REPO_ROOT, FILE)}`);
  for (const w of warnings) console.log(`  WARN  ${w}`);
  for (const e of errors) console.log(`  ERROR ${e}`);

  if (errors.length) {
    console.log(`\n${errors.length} error(s) found — do not upload.`);
    process.exitCode = 1;
  } else {
    console.log(`\n0 error(s) found${warnings.length ? `, ${warnings.length} warning(s)` : ""}.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
