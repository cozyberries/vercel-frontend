#!/usr/bin/env node

/**
 * Add catalogue-aligned columns to Stock Summary CSV.
 *
 * Reads Product Catalogue.csv and Stock Summary.csv, then adds three NEW columns
 * to the stock file with catalogue naming (product title, size, print). Existing
 * columns and values are left unchanged.
 *
 * New columns:
 *   - Catalogue Product Title
 *   - Catalogue Size
 *   - Catalogue Print
 *
 * Usage:
 *   node scripts/add-catalogue-columns-to-stock-summary.mjs [stock-csv-path]
 *
 * Default stock path: public/Stock Summary.csv
 * Catalogue path: public/Product Catalogue.csv
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { parse } from "csv-parse/sync";

const ROOT = resolve(process.cwd());
const DEFAULT_STOCK_PATH = resolve(ROOT, "public/Stock Summary.csv");
const DEFAULT_CATALOGUE_PATH = resolve(ROOT, "public/Product Catalogue.csv");

// ── Stock PRINT (column PRINTS) → Catalogue print name (first part of Product Title) ──
const STOCK_PRINT_TO_CATALOGUE_PRINT = {
  ROCKET: "Rocket Ranger",
  DAISY: "Lilac Blossom",
  PEAR: "Soft Pear",
  "3 ROSES": "Petal Pops",
  ORANGE: "Joyful Orbs",
  MOON: "Moon and Stars",
  MUSHROOM: "Mushie Mini",
  POPSICLES: "Popsicles",
  PINE: "Pine Cone",
  GREEN: "Aloe Mist",
  PINK: "Baby Blush",
  PEACH: "Soft Coral",
  "COCONUT MILK": "Coconut Milk",
  NUTS: "Naughty Nuts",
};

// ── Stock SIZE → Catalogue size format (as in Available Size, e.g. (6-12M)) ──
function stockSizeToCatalogueSize(stockSize) {
  const s = (stockSize ?? "").trim();
  if (!s) return "";
  const map = {
    "0-3": "(0-3M)",
    "3-6": "(3-6M)",
    "6-12": "(6-12M)",
    "1-2": "(1-2Y)",
    "2-3": "(2-3Y)",
    "3-4": "(3-4Y)",
    "4-5": "(4-5Y)",
    "5-6": "(5-6Y)",
  };
  return map[s] ?? `(${s})`;
}

// ── Stock ITEM → key(s) to match against catalogue Product Title (product type part) ──
// Catalogue titles are "Print - ProductType"; we match ProductType with these strings.
const STOCK_ITEM_TO_CATALOGUE_PRODUCT_TYPE = {
  "GIRLS ROMPERS": "Muslin Rompers - Mayra",
  "KNEE LENGTH ROMPERS": "Muslin Rompers - Unisex",
  "GIRLS COLLAR FROCK": "Muslin Collar Frock",
  "GIRLS J.PAN COLLAR FROCK": "Japanese Muslin Frock",
  "FRILL SLEEVE FROCK": "Frill Sleeve Muslin Frock",
  "SLEEVELESS FROCK": "Sleeveless Muslin Cotton Frock",
  PYJAMAS: "Long Sleeve Pyjamas",
  "BOYS CO ORDS": "Boys Co ord set",
  "JHABLA AND SHORTS-SLEEVELESS": "Sleeveless Jabla and Shorts",
  "JHABLA AND SHORTS-HALF SLEEVES": "Half Sleeve Jabla and Shorts",
  "GIRLS COORDS-HONCHO": "Flora Bow Co ord set",
  "GIRLS COORDS-LAYERED": "Layered Co ord set",
  "GIRLS COORDS-RUFFLE": "Ruffle Sleeve Co ord set",
  "NB- JHABLA KNOTTED": "Jhabla Knotted",
  "NB- JHABLA SLEEVELESS": "Sleeveless jabla",
  "NB- JHABLA HALF SLEEVES": "Half Sleeve Jabla and Shorts",
  "NB- SHORTS": "Newborn Shorts",
  "NB-NAPPY": "Newborn Nappy",
  "NB-CAP": "Newborn Cap",
  "NB-MITTENS": "Newborn Mittens",
  "NB-BOOTIES": "Newborn Booties",
  TOWEL: "Towel",
  SWADDLE: "Swaddle",
  BLANKET: "Blanket",
};

function parseCatalogue(csvPath) {
  const raw = readFileSync(csvPath, "utf-8");
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });
  const entries = [];
  for (const row of rows) {
    const title = (row["Product Title"] ?? "").trim();
    if (!title) continue;
    const dash = title.indexOf(" - ");
    const print = dash >= 0 ? title.slice(0, dash).trim() : "";
    const productType = dash >= 0 ? title.slice(dash + 3).trim() : title;
    let sizesStr = (row["Available Size"] ?? "").trim();
    const sizes = sizesStr
      ? sizesStr.replace(/^\(|\)$/g, "").split(/\s*\),\s*\(?/).filter(Boolean)
      : [];
    entries.push({
      productTitle: title,
      print,
      productType,
      sizes,
    });
  }
  return entries;
}

function buildCatalogueLookup(catalogueEntries) {
  const byPrintAndType = new Map();
  for (const e of catalogueEntries) {
    const key = `${e.print.toLowerCase()}|${e.productType.toLowerCase()}`;
    if (!byPrintAndType.has(key)) byPrintAndType.set(key, e);
  }
  return byPrintAndType;
}

function findCatalogueTitle(stockItem, stockPrint, catalogueLookup) {
  const cataloguePrint = STOCK_PRINT_TO_CATALOGUE_PRINT[stockPrint?.trim()];
  const productType = STOCK_ITEM_TO_CATALOGUE_PRODUCT_TYPE[stockItem?.trim()];
  if (!cataloguePrint || !productType) return "";
  const printLower = cataloguePrint.toLowerCase();
  const typeLower = productType.toLowerCase();
  const key = `${printLower}|${typeLower}`;
  const found = catalogueLookup.get(key);
  if (found) return found.productTitle;
  for (const [k, v] of catalogueLookup) {
    const [p, t] = k.split("|");
    if (p === printLower && (t === typeLower || t.includes(typeLower) || typeLower.includes(t)))
      return v.productTitle;
  }
  return "";
}

function parseStockCsv(csvPath) {
  const raw = readFileSync(csvPath, "utf-8");
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: false,
    trim: true,
    relax_column_count: true,
  });
  return rows;
}

function escapeCsvField(val) {
  if (val == null) return "";
  const s = String(val).trim();
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r"))
    return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsvLine(columns, row) {
  return columns.map((col) => escapeCsvField(row[col])).join(",");
}

function main() {
  const stockPath = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : DEFAULT_STOCK_PATH;
  const cataloguePath = DEFAULT_CATALOGUE_PATH;

  if (!existsSync(stockPath)) {
    console.error("❌ Stock Summary file not found:", stockPath);
    process.exit(1);
  }
  if (!existsSync(cataloguePath)) {
    console.error("❌ Product Catalogue file not found:", cataloguePath);
    process.exit(1);
  }

  const catalogueEntries = parseCatalogue(cataloguePath);
  const catalogueLookup = buildCatalogueLookup(catalogueEntries);

  const stockRows = parseStockCsv(stockPath);
  const ORIGINAL_COLUMNS = [
    "ITEM", "SIZE", "PRINTS", "TOTAL IN", "TOTAL OUT", "CURRENT STOCK",
    "LOW STOCK ALERT", "MRP", "SELLING PRICE", "COURIER AND PACKAGING", "PROFIT",
  ];
  const NEW_COLUMN_NAMES = ["Catalogue Product Title", "Catalogue Size", "Catalogue Print"];
  const allColumns = [...ORIGINAL_COLUMNS, ...NEW_COLUMN_NAMES];

  const outRows = stockRows.map((row) => {
    const item = row["ITEM"] ?? row["item"] ?? "";
    const size = row["SIZE"] ?? row["size"] ?? "";
    const prints = row["PRINTS"] ?? row["prints"] ?? "";

    const catalogueTitle = findCatalogueTitle(item, prints, catalogueLookup);
    const catalogueSize = stockSizeToCatalogueSize(size);
    const cataloguePrint = STOCK_PRINT_TO_CATALOGUE_PRINT[prints?.trim()] ?? "";

    const newRow = { ...row };
    newRow["Catalogue Product Title"] = catalogueTitle;
    newRow["Catalogue Size"] = catalogueSize;
    newRow["Catalogue Print"] = cataloguePrint;
    return newRow;
  });

  const headerLine = allColumns.join(",");
  const dataLines = outRows.map((row) => toCsvLine(allColumns, row));
  const csvContent = [headerLine, ...dataLines].join("\n") + "\n";

  writeFileSync(stockPath, csvContent, "utf-8");
  console.log("✓ Added 3 columns to Stock Summary:");
  console.log("  - Catalogue Product Title");
  console.log("  - Catalogue Size");
  console.log("  - Catalogue Print");
  console.log(`  Updated: ${stockPath}`);
}

main();
