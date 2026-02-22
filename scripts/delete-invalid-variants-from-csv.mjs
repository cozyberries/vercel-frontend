#!/usr/bin/env node

/**
 * Delete product_variants listed in "non-existing product" CSV.
 *
 * CSV columns: product_id, name, size, color, stock_quantity
 * Matches variants by (product_id, size_slug, color_id) and deletes them.
 * Recomputes products.stock_quantity from remaining variant sums.
 *
 * Usage:
 *   node scripts/delete-invalid-variants-from-csv.mjs [csv-path] [options]
 *
 * Arguments:
 *   csv-path    Optional path to CSV (default: public/Stocks & orders - non-existing product.csv)
 *
 * Options:
 *   --dry-run   Print what would be deleted without writing to Supabase
 *
 * Requires: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { existsSync, readFileSync } from "fs";
import { parse } from "csv-parse/sync";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const DRY_RUN = process.argv.includes("--dry-run");

const DEFAULT_CSV_PATH = resolve(
  process.cwd(),
  "public/Stocks & orders - non-existing product.csv"
);

function normalizeProductId(raw) {
  const s = (raw ?? "").trim();
  return s.startsWith("/") ? s.slice(1) : s;
}

function parseCsv(filePath) {
  const raw = readFileSync(filePath, "utf-8");
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  const rows = [];
  for (const row of records) {
    const productId = normalizeProductId(row["product_id"] ?? "");
    const size = (row["size"] ?? "").trim();
    const color = (row["color"] ?? "").trim();
    if (!productId || !size || !color) continue;
    rows.push({ product_id: productId, size, color });
  }
  return rows;
}

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== LIVE RUN ===");
  console.log();

  const positionalArgs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const csvPath = positionalArgs[0]
    ? resolve(process.cwd(), positionalArgs[0])
    : DEFAULT_CSV_PATH;

  if (!existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  const rows = parseCsv(csvPath);
  console.log(`Parsed ${rows.length} invalid variant(s) from ${csvPath}.`);
  if (rows.length === 0) {
    console.log("Nothing to delete.");
    return;
  }
  console.log();

  const [sizesRes, colorsRes] = await Promise.all([
    supabase.from("sizes").select("slug, name"),
    supabase.from("colors").select("id, name"),
  ]);

  if (sizesRes.error) throw new Error(sizesRes.error.message);
  if (colorsRes.error) throw new Error(colorsRes.error.message);

  const sizeByName = Object.fromEntries(
    (sizesRes.data || []).map((s) => [s.name, s.slug])
  );
  const colorByName = Object.fromEntries(
    (colorsRes.data || []).map((c) => [c.name, c.id])
  );

  const toDelete = [];
  const skipped = [];
  for (const row of rows) {
    const sizeSlug = sizeByName[row.size];
    const colorId = colorByName[row.color];
    if (!sizeSlug || !colorId) {
      skipped.push(row);
      continue;
    }
    toDelete.push({
      product_id: row.product_id,
      size_slug: sizeSlug,
      color_id: colorId,
    });
  }

  if (skipped.length > 0) {
    console.log(`⚠ Skipped ${skipped.length} row(s) (size or color not in DB):`);
    for (const s of skipped) console.log(`   ${s.product_id} size="${s.size}" color="${s.color}"`);
    console.log();
  }

  const productIds = [...new Set(toDelete.map((d) => d.product_id))];
  const { data: variants, error: fetchErr } = await supabase
    .from("product_variants")
    .select("id, product_id, size_slug, color_id")
    .in("product_id", productIds);

  if (fetchErr) throw new Error(fetchErr.message);

  const variantByKey = new Map();
  for (const v of variants || []) {
    const key = `${v.product_id}:${v.size_slug}:${v.color_id}`;
    variantByKey.set(key, v);
  }

  const idsToDelete = [];
  const notFound = [];
  for (const d of toDelete) {
    const key = `${d.product_id}:${d.size_slug}:${d.color_id}`;
    const variant = variantByKey.get(key);
    if (variant) {
      idsToDelete.push(variant.id);
    } else {
      notFound.push(d);
    }
  }

  if (notFound.length > 0) {
    console.log(`⚠ No matching variant for ${notFound.length} row(s):`);
    for (const n of notFound)
      console.log(`   product_id=${n.product_id} size_slug=${n.size_slug} color_id=${n.color_id}`);
    console.log();
  }

  if (idsToDelete.length === 0) {
    console.log("No variants to delete (none matched in DB).");
    return;
  }

  console.log(`Will delete ${idsToDelete.length} variant(s).`);

  if (DRY_RUN) {
    console.log("\nDRY RUN — no changes written. Rerun without --dry-run to delete.\n");
    return;
  }

  const { error: deleteErr } = await supabase
    .from("product_variants")
    .delete()
    .in("id", idsToDelete);

  if (deleteErr) {
    console.error("❌ Delete failed:", deleteErr.message);
    process.exit(1);
  }

  console.log(`✓ Deleted ${idsToDelete.length} variant(s).`);

  // Recompute products.stock_quantity from remaining variants
  const { data: allVariants } = await supabase
    .from("product_variants")
    .select("product_id, stock_quantity");

  const stockByProduct = {};
  for (const v of allVariants || []) {
    stockByProduct[v.product_id] =
      (stockByProduct[v.product_id] || 0) + (v.stock_quantity || 0);
  }

  const productUpdates = Object.entries(stockByProduct).map(
    ([id, stock_quantity]) => ({ id, stock_quantity })
  );

  const BATCH = 50;
  for (let i = 0; i < productUpdates.length; i += BATCH) {
    const batch = productUpdates.slice(i, i + BATCH);
    for (const p of batch) {
      await supabase.from("products").update({ stock_quantity: p.stock_quantity }).eq("id", p.id);
    }
  }

  console.log("✓ Updated product stock totals.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
