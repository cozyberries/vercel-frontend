#!/usr/bin/env node

/**
 * Update product_variants.stock_quantity from revised stock CSV.
 *
 * CSV columns: product_id, name, size, color, stock_quantity
 * Matches variants by (product_id, size, color) and sets stock_quantity.
 * Only updates existing variants; does not insert or zero others.
 * Recomputes products.stock_quantity from variant sums after updates.
 *
 * Usage:
 *   node scripts/update-stock-from-revised-csv.mjs [csv-path] [options]
 *
 * Arguments:
 *   csv-path    Optional path to revised stock CSV (default: public/revised stock.csv)
 *
 * Options:
 *   --dry-run   Print what would be updated without writing to Supabase
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

const DEFAULT_CSV_PATH = resolve(process.cwd(), "public/revised stock.csv");

// CSV color name → DB color name (colors.name) when names differ
const CSV_COLOR_TO_DB_COLOR = {
  "Moon and Stars": "Moons And Stars",
  "Aloe Mist": "Aloe Green",
  "Baby Blush": "Pastel Pink",
  "Soft Coral": "Peach",
  "Rocket Ranger": "Rocket Rangers",
  "Naughty Nuts": "Naughty Nuts",
};

function normalizeProductId(raw) {
  const s = (raw ?? "").trim();
  return s.startsWith("/") ? s.slice(1) : s;
}

/**
 * Parse revised stock CSV (product_id, name, size, color, stock_quantity).
 * Returns rows with product_id, size (as-is), color (as-is), stock_quantity.
 */
function parseRevisedStockCsv(filePath) {
  const raw = readFileSync(filePath, "utf-8");
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  const rows = [];
  const seen = new Map();
  const duplicates = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const lineNo = i + 2;
    const productId = normalizeProductId(row["product_id"] ?? row["product id"] ?? "");
    const size = (row["size"] ?? "").trim();
    const color = (row["color"] ?? "").trim();
    const stockStr = String(row["stock_quantity"] ?? row["stock quantity"] ?? "0").replace(/\D/g, "");
    const stockQuantity = parseInt(stockStr, 10);
    const qty = Number.isFinite(stockQuantity) ? stockQuantity : 0;

    if (!productId) continue;

    const key = `${productId}\t${size}\t${color}`;
    if (seen.has(key)) {
      duplicates.push({ lineNo, product_id: productId, size, color, stock_quantity: qty, firstSeenLine: seen.get(key) });
      continue;
    }
    seen.set(key, lineNo);
    rows.push({
      product_id: productId,
      size,
      color,
      stock_quantity: qty,
    });
  }

  return { rows, duplicates };
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

  const { rows, duplicates } = parseRevisedStockCsv(csvPath);
  console.log(`Parsed ${rows.length} rows from ${csvPath} (unique by product_id + size + color).`);
  if (duplicates.length > 0) {
    console.log(`  (${duplicates.length} duplicate rows ignored; first occurrence used.)`);
  }
  console.log();

  if (rows.length === 0) {
    console.log("No data to process.");
    return;
  }

  // Load sizes and colors from DB
  const [sizesRes, colorsRes] = await Promise.all([
    supabase.from("sizes").select("slug, name"),
    supabase.from("colors").select("id, name"),
  ]);

  if (sizesRes.error) throw new Error(sizesRes.error.message);
  if (colorsRes.error) throw new Error(colorsRes.error.message);

  const sizeByName = Object.fromEntries((sizesRes.data || []).map((s) => [s.name, s.slug]));
  const colorByName = Object.fromEntries((colorsRes.data || []).map((c) => [c.name, c.id]));

  function resolveColorId(csvColor) {
    const name = (csvColor ?? "").trim();
    if (!name) return null;
    return colorByName[name] ?? colorByName[CSV_COLOR_TO_DB_COLOR[name]] ?? null;
  }

  // Build (product_id, size_slug, color_id) -> stock_quantity
  const updates = [];
  const skippedSize = [];
  const skippedColor = [];
  for (const row of rows) {
    const sizeSlug = sizeByName[row.size];
    const colorId = resolveColorId(row.color);
    if (!sizeSlug) {
      skippedSize.push({ product_id: row.product_id, size: row.size, color: row.color });
      continue;
    }
    if (!colorId) {
      skippedColor.push({ product_id: row.product_id, size: row.size, color: row.color });
      continue;
    }
    updates.push({
      product_id: row.product_id,
      size_slug: sizeSlug,
      color_id: colorId,
      stock_quantity: row.stock_quantity,
    });
  }

  if (skippedSize.length > 0) {
    console.log(`⚠ Skipped ${skippedSize.length} rows (size not in DB):`);
    for (const s of skippedSize.slice(0, 10))
      console.log(`   product_id=${s.product_id} size="${s.size}" color="${s.color}"`);
    if (skippedSize.length > 10) console.log(`   ... and ${skippedSize.length - 10} more`);
    console.log();
  }
  if (skippedColor.length > 0) {
    console.log(`⚠ Skipped ${skippedColor.length} rows (color not in DB):`);
    for (const s of skippedColor.slice(0, 10))
      console.log(`   product_id=${s.product_id} size="${s.size}" color="${s.color}"`);
    if (skippedColor.length > 10) console.log(`   ... and ${skippedColor.length - 10} more`);
    console.log();
  }

  console.log(`Will update stock_quantity for ${updates.length} variant(s) (product_id + size + color).\n`);

  if (DRY_RUN) {
    const sample = updates.slice(0, 15);
    console.log("Sample (product_id, size_slug, color_id → stock_quantity):");
    for (const u of sample) {
      console.log(`  ${u.product_id} ${u.size_slug} ${u.color_id} → ${u.stock_quantity}`);
    }
    console.log("\nDRY RUN — no changes written. Rerun without --dry-run to apply.\n");
    return;
  }

  // Fetch all variants for the product_ids we're updating
  const productIds = [...new Set(updates.map((u) => u.product_id))];
  const { data: variants, error: fetchErr } = await supabase
    .from("product_variants")
    .select("id, product_id, size_slug, color_id, stock_quantity")
    .in("product_id", productIds);

  if (fetchErr) throw new Error(fetchErr.message);

  const variantByKey = new Map();
  for (const v of variants || []) {
    const key = `${v.product_id}:${v.size_slug}:${v.color_id}`;
    variantByKey.set(key, v);
  }

  let updated = 0;
  const notFound = [];
  for (const u of updates) {
    const key = `${u.product_id}:${u.size_slug}:${u.color_id}`;
    const variant = variantByKey.get(key);
    if (!variant) {
      notFound.push({ product_id: u.product_id, size_slug: u.size_slug, color_id: u.color_id, stock_quantity: u.stock_quantity });
      continue;
    }
    const { error: upErr } = await supabase
      .from("product_variants")
      .update({ stock_quantity: u.stock_quantity })
      .eq("id", variant.id);
    if (!upErr) updated++;
  }

  if (notFound.length > 0) {
    console.log(`⚠ No matching variant for ${notFound.length} row(s) (product_id + size + color):`);
    for (const n of notFound.slice(0, 10))
      console.log(`   product_id=${n.product_id} size_slug=${n.size_slug} color_id=${n.color_id}`);
    if (notFound.length > 10) console.log(`   ... and ${notFound.length - 10} more`);
    console.log();
  }

  console.log(`✓ Updated stock_quantity for ${updated} variant(s).\n`);

  // Recompute products.stock_quantity from variant sums
  console.log("Updating product stock totals...");
  const { data: allVariantsForProducts } = await supabase
    .from("product_variants")
    .select("product_id, stock_quantity")
    .in("product_id", productIds);

  const stockByProduct = {};
  for (const v of allVariantsForProducts || []) {
    stockByProduct[v.product_id] = (stockByProduct[v.product_id] || 0) + (v.stock_quantity || 0);
  }

  const productUpdates = Object.entries(stockByProduct).map(([id, stock_quantity]) => ({
    id,
    stock_quantity,
  }));

  const BATCH = 50;
  let productsUpdated = 0;
  for (let i = 0; i < productUpdates.length; i += BATCH) {
    const batch = productUpdates.slice(i, i + BATCH);
    const { error } = await supabase.from("products").upsert(batch, { onConflict: "id" });
    if (error) {
      for (const row of batch) {
        const { error: rowError } = await supabase
          .from("products")
          .update({ stock_quantity: row.stock_quantity })
          .eq("id", row.id);
        if (!rowError) productsUpdated++;
      }
    } else {
      productsUpdated += batch.length;
    }
    process.stdout.write(`  Updated ${Math.min(i + BATCH, productUpdates.length)}/${productUpdates.length} products\r`);
  }
  console.log(`\n✓ Updated stock_quantity for ${productsUpdated} product(s).\n`);

  console.log("Done!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
