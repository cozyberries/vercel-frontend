#!/usr/bin/env node
// Generate Flipkart bulk-listing rows from the live catalog. Usage:
//   npm run flipkart:export -- --slug=coords-set-chinese-collar-soft-pear
//   npm run flipkart:export -- --all
// Writes a TSV to paste into the template (row 5 onward) plus a report of
// everything a human still has to resolve. Never rewrites the .xls, because
// that would destroy its dropdowns and Flipkart's CTRL+SHIFT+S validate macro.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
// Named/namespace imports from "xlsx" drop readFile/writeFile under Node's
// CJS interop (cjs-module-lexer doesn't statically see them) — default import
// gets the whole CommonJS module.exports object instead.
import XLSX from "xlsx";
import { COLUMN_COUNT } from "../lib/flipkart/columns.ts";
import { CONFIG, placeholderFields } from "../lib/flipkart/config.ts";
import { mapProduct, MappingError } from "../lib/flipkart/mapping.ts";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "1"];
  }),
);

const TEMPLATE = args.template ?? "C_kids-apparel-combo_6b8552c31ff94c26_1309-0947FK_REQOA2EHXFEXI.xls";
const SHEET = "kids_apparel_combo";
const FIRST_DATA_ROW = 4;
const BASE = (args.url ?? "https://cozyberries.in").replace(/\/$/, "");
const OUT_DIR = "exports/flipkart";

const slugify = (s) =>
  s.toLowerCase().replace(/&/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Existing SKU + Flipkart-hosted image URLs, keyed by slugified SKU. */
function readTemplate(file) {
  const book = XLSX.readFile(file);
  const sheet = book.Sheets[SHEET];
  if (!sheet) throw new Error(`Sheet ${SHEET} not found in ${file}`);
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  const rows = new Map();
  for (let i = FIRST_DATA_ROW; i < grid.length; i++) {
    const sku = String(grid[i]?.[6] ?? "").trim();
    if (!sku) continue;
    const images = [46, 47, 48, 49].map((c) => String(grid[i]?.[c] ?? "").trim()).filter(Boolean);
    rows.set(slugify(sku), { rowIndex: i, sku, images });
  }
  return rows;
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

async function main() {
  const existingRows = readTemplate(TEMPLATE);
  const catalog = await getJson(`${BASE}/api/catalog`);
  const bySlug = new Map(catalog.products.map((p) => [p.slug, p]));

  const wanted = args.all
    ? [...bySlug.keys()]
    : [args.slug].filter(Boolean);
  if (wanted.length === 0) {
    console.error("Pass --slug=<product-slug> or --all");
    process.exit(1);
  }

  const tsvRows = [];
  const skipped = [];
  const blanks = new Map();

  for (const slug of wanted) {
    if (!bySlug.has(slug)) {
      skipped.push(`${slug} — not in the catalog`);
      continue;
    }
    const existing = existingRows.get(slug);
    if (!existing) {
      skipped.push(`${slug} — no row in the template, so no Flipkart image URLs to carry forward`);
      continue;
    }
    const product = await getJson(`${BASE}/api/products/${slug}`).then((d) => d.product ?? d);
    const result = mapProduct(product, existing, CONFIG);
    if (result.status === "skipped") {
      skipped.push(`${slug} — ${result.reason}`);
      continue;
    }
    for (const row of result.rows) {
      if (row.cells.length !== COLUMN_COUNT) throw new Error(`bad row width for ${slug}`);
      tsvRows.push(row.cells.join("\t"));
      for (const name of row.blanks) blanks.set(name, (blanks.get(name) ?? 0) + 1);
    }
  }

  // Template rows with no catalog product — renamed or junk, resolved by hand.
  const orphans = [...existingRows.entries()]
    .filter(([slug]) => !bySlug.has(slug))
    .map(([, row]) => `row ${row.rowIndex + 1}: ${row.sku}`);

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "kids-apparel-combo.tsv"), tsvRows.join("\n") + "\n", "utf8");

  const report = [
    "# Flipkart export report",
    "",
    `Generated ${new Date().toISOString()} from ${BASE}`,
    `Rows written: **${tsvRows.length}**`,
    "",
    "## Paste instructions",
    "",
    `Open \`${TEMPLATE}\`, go to sheet \`${SHEET}\`, click cell A5, paste the TSV,`,
    "then press CTRL+SHIFT+S to run Flipkart's own validation.",
    "",
    "## Must be fixed before upload",
    "",
    ...(placeholderFields(CONFIG).length
      ? placeholderFields(CONFIG).map((f) => `- config \`${f}\` is still a placeholder`)
      : ["- none"]),
    ...[...blanks].map(([name, n]) => `- mandatory column \`${name}\` is blank on ${n} row(s)`),
    "",
    "## Skipped",
    "",
    ...(skipped.length ? skipped.map((s) => `- ${s}`) : ["- none"]),
    "",
    "## Template rows with no catalog match",
    "",
    "Renamed or junk. Resolve by hand — guessing would attach our data to the wrong images.",
    "",
    ...(orphans.length ? orphans.map((s) => `- ${s}`) : ["- none"]),
    "",
  ].join("\n");
  await writeFile(path.join(OUT_DIR, "report.md"), report, "utf8");

  console.log(`Wrote ${tsvRows.length} row(s) to ${OUT_DIR}/kids-apparel-combo.tsv`);
  console.log(`Report: ${OUT_DIR}/report.md`);
  if (blanks.size || placeholderFields(CONFIG).length) {
    console.log("NOT upload-ready — see the report.");
  }
}

main().catch((err) => {
  if (err instanceof MappingError) console.error(`Mapping aborted: ${err.message}`);
  else console.error(err);
  process.exit(1);
});
