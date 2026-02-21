#!/usr/bin/env node

/**
 * Join Stock Summary with Product Catalogue on Product Title.
 * Adds "Product id" as the first column to the stock summary.
 *
 * Usage: node scripts/join-stock-with-catalogue.mjs
 * Reads: public/Product Catalogue.csv, public/Stock Summary Revised.csv
 * Writes: public/Stock Summary Revised.csv (with Product id as first column)
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { parse } from "csv-parse/sync";

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

const ROOT = resolve(process.cwd());
const CATALOGUE_PATH = resolve(ROOT, "public/Product Catalogue.csv");
const STOCK_PATH = resolve(ROOT, "public/Stock Summary Revised.csv");

const catalogueCsv = readFileSync(CATALOGUE_PATH, "utf-8");
const stockCsv = readFileSync(STOCK_PATH, "utf-8");

const catalogueRows = parse(catalogueCsv, { columns: true, skip_empty_lines: true });
const stockRows = parse(stockCsv, { columns: true, skip_empty_lines: true });

// Build map: Product Title -> Product id (first occurrence)
const titleToId = new Map();
for (const row of catalogueRows) {
  const title = (row["Product Title"] || "").trim();
  const id = (row["Product id"] || "").trim();
  if (title && !titleToId.has(title)) {
    titleToId.set(title, id);
  }
}

// Stock columns (as in file)
const stockColumns = Object.keys(stockRows[0] || {});

// New rows: Product id first, then existing stock columns
const outRows = stockRows.map((row) => {
  const productTitle = (row["Product Title"] || "").trim();
  const productId = titleToId.get(productTitle) ?? "";
  return {
    "Product id": productId,
    ...row,
  };
});

const outColumns = ["Product id", ...stockColumns];
const headerLine = outColumns.join(",");
const dataLines = outRows.map((row) => toCsvLine(outColumns, row));
const outCsv = [headerLine, ...dataLines].join("\n") + "\n";
writeFileSync(STOCK_PATH, outCsv, "utf-8");

console.log(`Joined ${outRows.length} stock rows with catalogue. Product id added as first column.`);
console.log(`Updated: ${STOCK_PATH}`);
