#!/usr/bin/env node

/**
 * Update Supabase stock from Stock Summary Revised CSV
 *
 * Uses columns: Product id, Size (NEW), Prints (New), Current Stock
 * - Does not sum stock: duplicate (product_id, size, prints) are reported; first occurrence is used
 * - Truncates all product_variants.stock_quantity to 0
 * - Sets color_id and stock_quantity for each (product_id, size) from the CSV (Prints (New) → color_id)
 * - Matches variants by (product_id, size_id); inserts new variants if missing for (product_id, size_id, color_id)
 * - Recomputes products.stock_quantity from variant sums
 *
 * Usage:
 *   node scripts/update-stock-from-csv.mjs [csv-path] [options]
 *
 * Arguments:
 *   csv-path    Optional path to Stock Summary CSV (default: public/Stock Summary Revised.csv)
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

const DEFAULT_CSV_PATH = resolve(process.cwd(), "public/Stock Summary Revised.csv");

// CSV size token (e.g. "6-12", "1-2") → DB size name (e.g. "6-12M", "1-2Y")
const SIZE_TOKEN_TO_DB_NAME = {
  "0-3": "0-3M",
  "3-6": "3-6M",
  "6-12": "6-12M",
  "1-2": "1-2Y",
  "2-3": "2-3Y",
  "3-4": "3-4Y",
  "4-5": "4-5Y",
  "5-6": "5-6Y",
};

// CSV "Prints (New)" → DB color name (colors.name)
const PRINTS_NEW_TO_DB_COLOR = {
  "Aloe Mist": "Aloe Green",
  "Baby Blush": "Pastel Pink",
  "Joyful Orbs": "Joyful Orbs",
  "Moon and Stars": "Moons And Stars",
  "Mushie Mini": "Mushie Mini",
  "Popsicles": "Popsicles",
  "Pine Cone": "Pine Cone",
  "Soft Pear": "Soft Pear",
  "Lilac Blossom": "Lilac Blossom",
  "Petal Pops": "Petal Pops",
  "Soft Coral": "Peach",
  "Coconut Milk": "Coconut Milk",
  "Rocket Ranger": "Rocket Rangers",
  "Naughty Nuts": "Naughty Nuts",
};

function normalizeProductId(raw) {
  const s = (raw ?? "").trim();
  return s.startsWith("/") ? s.slice(1) : s;
}

/**
 * Normalize "Size (NEW)" from CSV to DB size name.
 * e.g. "(6-12M)" -> "6-12M", "(1-2Y)" -> "1-2Y"
 */
function normalizeSizeName(sizeNew) {
  const s = (sizeNew ?? "").trim().replace(/^\(|\)$/g, "").trim();
  return SIZE_TOKEN_TO_DB_NAME[s] ?? s;
}

/**
 * Parse CSV and detect duplicates by (product_id, size, prints).
 * Returns { rows, duplicates } where rows are unique (first occurrence kept), duplicates are reported.
 */
function parseStockCsv(filePath) {
  const raw = readFileSync(filePath, "utf-8");
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  const seen = new Map();
  const rows = [];
  const duplicates = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const lineNo = i + 2;
    const productId = normalizeProductId(row["Product id"]);
    const sizeNew = (row["Size (NEW)"] ?? "").trim();
    const printsNew = (row["Prints (New)"] ?? "").trim();
    const currentStock = parseInt(String(row["Current Stock"] ?? "0").replace(/\D/g, ""), 10);
    const qty = Number.isFinite(currentStock) ? currentStock : 0;

    if (!productId) continue;

    const sizeName = normalizeSizeName(sizeNew);
    const key = `${productId}\t${sizeName}\t${printsNew}`;

    if (seen.has(key)) {
      const first = seen.get(key);
      duplicates.push({
        lineNo,
        product_id: productId,
        size_name: sizeName,
        prints_new: printsNew,
        current_stock: qty,
        firstSeenLine: first.lineNo,
        firstSeenStock: first.current_stock,
      });
      continue;
    }
    seen.set(key, { lineNo, current_stock: qty });
    rows.push({
      product_id: productId,
      size_name: sizeName,
      prints_new: printsNew,
      current_stock: qty,
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

  const { rows, duplicates } = parseStockCsv(csvPath);
  const totalRows = rows.length + duplicates.length;
  console.log(`Parsed ${totalRows} rows from ${csvPath} (${rows.length} unique by product_id + size + prints).\n`);

  if (duplicates.length > 0) {
    console.log("═══════════════════════════════════════════════════════");
    console.log("  DUPLICATES (same Product id + Size (NEW) + Prints (New))");
    console.log("  Stock is NOT summed; first occurrence is used.");
    console.log("═══════════════════════════════════════════════════════\n");
    for (const d of duplicates) {
      console.log(
        `  CSV line ${d.lineNo}: product_id=${d.product_id} size=${d.size_name} prints="${d.prints_new}" current_stock=${d.current_stock}`
      );
      console.log(
        `    → Duplicate of line ${d.firstSeenLine} (used stock=${d.firstSeenStock}). This row ignored.\n`
      );
    }
    console.log(`Total duplicate rows ignored: ${duplicates.length}\n`);
  } else {
    console.log("No duplicate (product_id + size + prints) rows found.\n");
  }

  if (rows.length === 0) {
    console.log("No data to process.");
    return;
  }

  // Load sizes and colors from DB
  const [sizesRes, colorsRes] = await Promise.all([
    supabase.from("sizes").select("id, name"),
    supabase.from("colors").select("id, name"),
  ]);

  if (sizesRes.error) throw new Error(sizesRes.error.message);
  if (colorsRes.error) throw new Error(colorsRes.error.message);

  const sizeByName = Object.fromEntries((sizesRes.data || []).map((s) => [s.name, s.id]));
  const colors = colorsRes.data || [];
  const colorByName = Object.fromEntries(colors.map((c) => [c.name, c.id]));

  function resolveColorId(printsNew) {
    const name = (printsNew ?? "").trim();
    if (!name) return null;
    // Prefer direct match (after rename-db-colors-to-file), then fallback mapping
    return colorByName[name] ?? colorByName[PRINTS_NEW_TO_DB_COLOR[name]] ?? null;
  }

  // Build (product_id, size_id, color_id) -> current_stock
  const stockUpdates = [];
  const skippedSize = [];
  const skippedColor = [];
  for (const row of rows) {
    const sizeId = sizeByName[row.size_name];
    const colorId = resolveColorId(row.prints_new);
    if (!sizeId) {
      skippedSize.push({ product_id: row.product_id, size_name: row.size_name, prints_new: row.prints_new });
      continue;
    }
    if (!colorId) {
      skippedColor.push({ product_id: row.product_id, size_name: row.size_name, prints_new: row.prints_new });
      continue;
    }
    stockUpdates.push({
      product_id: row.product_id,
      size_id: sizeId,
      color_id: colorId,
      stock_quantity: row.current_stock,
    });
  }

  if (skippedSize.length > 0) {
    console.log(`⚠ Skipped ${skippedSize.length} rows (size not in DB):`);
    for (const s of skippedSize.slice(0, 15))
      console.log(`   product_id=${s.product_id} size="${s.size_name}" prints="${s.prints_new}"`);
    if (skippedSize.length > 15) console.log(`   ... and ${skippedSize.length - 15} more`);
    console.log();
  }
  if (skippedColor.length > 0) {
    console.log(`⚠ Skipped ${skippedColor.length} rows (Prints (New) not mapped to DB color):`);
    for (const s of skippedColor.slice(0, 15))
      console.log(`   product_id=${s.product_id} size="${s.size_name}" prints="${s.prints_new}"`);
    if (skippedColor.length > 15) console.log(`   ... and ${skippedColor.length - 15} more`);
    console.log();
  }

  console.log(`Will set color_id and stock_quantity for ${stockUpdates.length} variant rows.\n`);

  if (DRY_RUN) {
    const sample = stockUpdates.slice(0, 10);
    console.log("Sample (product_id, size_id, color_id → stock_quantity):");
    for (const u of sample) {
      console.log(`  ${u.product_id} ${u.size_id} ${u.color_id} → ${u.stock_quantity}`);
    }
    console.log("\nDRY RUN — no changes written. Rerun without --dry-run to apply.\n");
    return;
  }

  // 1. Fetch all variants (include price for possible new inserts) and products (for default price)
  console.log("Fetching product_variants and products...");
  const productIdsFromCsv = [...new Set(stockUpdates.map((u) => u.product_id))];
  const { data: allVariants, error: fetchErr } = await supabase
    .from("product_variants")
    .select("id, product_id, size_id, color_id, stock_quantity, price")
    .in("product_id", productIdsFromCsv);

  if (fetchErr) throw new Error(fetchErr.message);

  const { data: productsForPrice } = await supabase
    .from("products")
    .select("id, price")
    .in("id", productIdsFromCsv);

  const productPriceById = Object.fromEntries(
    (productsForPrice || []).map((p) => [p.id, p.price])
  );

  // 2. Zero stock for all variants we're about to update (so CSV is source of truth)
  console.log("Zeroing variant stock for affected products...");
  const BATCH = 100;
  let zeroed = 0;
  for (let i = 0; i < (allVariants || []).length; i += BATCH) {
    const chunk = (allVariants || []).slice(i, i + BATCH);
    for (const v of chunk) {
      const { error: upErr } = await supabase
        .from("product_variants")
        .update({ stock_quantity: 0 })
        .eq("id", v.id);
      if (!upErr) zeroed++;
    }
    process.stdout.write(`  Zeroed ${Math.min(i + BATCH, allVariants.length)}/${allVariants.length} variants\r`);
  }
  console.log(`\n✓ Set stock_quantity = 0 for ${zeroed} variants.\n`);

  // 3. Build (product_id, size_id) -> list of variants (for matching null color_id)
  const variantsByProductSize = new Map();
  for (const v of allVariants || []) {
    const key = `${v.product_id}:${v.size_id}`;
    if (!variantsByProductSize.has(key)) variantsByProductSize.set(key, []);
    variantsByProductSize.get(key).push(v);
  }

  // 4. Apply CSV: set color_id and stock_quantity for each (product_id, size_id, color_id)
  console.log("Applying color_id and stock_quantity from CSV...");
  let updated = 0;
  let inserted = 0;
  for (const u of stockUpdates) {
    const key = `${u.product_id}:${u.size_id}`;
    const candidates = variantsByProductSize.get(key) || [];

    // Prefer variant that already has this color_id; else use one with color_id null
    let variant = candidates.find((v) => v.color_id === u.color_id);
    if (!variant) variant = candidates.find((v) => v.color_id == null);

    if (variant) {
      const { error: upErr } = await supabase
        .from("product_variants")
        .update({
          color_id: u.color_id,
          stock_quantity: u.stock_quantity,
        })
        .eq("id", variant.id);
      if (!upErr) {
        updated++;
        const idx = candidates.indexOf(variant);
        if (idx !== -1) candidates.splice(idx, 1);
      }
    } else {
      const price =
        (allVariants || []).find((v) => v.product_id === u.product_id)?.price ??
        productPriceById[u.product_id] ??
        0;
      const { error: insErr } = await supabase.from("product_variants").insert({
        product_id: u.product_id,
        size_id: u.size_id,
        color_id: u.color_id,
        stock_quantity: u.stock_quantity,
        price,
      });
      if (!insErr) inserted++;
    }
  }
  console.log(`✓ Updated ${updated} variants (color_id + stock_quantity).`);
  if (inserted > 0) console.log(`✓ Inserted ${inserted} new variants.\n`);
  else console.log();

  // 3. Recompute products.stock_quantity from variant sums
  console.log("Updating product stock totals...");
  const { data: variantsAfter } = await supabase
    .from("product_variants")
    .select("product_id, stock_quantity");

  const stockByProduct = {};
  for (const v of variantsAfter || []) {
    stockByProduct[v.product_id] = (stockByProduct[v.product_id] || 0) + (v.stock_quantity || 0);
  }

  const productUpdates = Object.entries(stockByProduct).map(([id, stock_quantity]) => ({
    id,
    stock_quantity,
  }));

  const STOCK_BATCH_SIZE = 50;
  let productsUpdated = 0;
  for (let i = 0; i < productUpdates.length; i += STOCK_BATCH_SIZE) {
    const batch = productUpdates.slice(i, i + STOCK_BATCH_SIZE);
    const { error } = await supabase.from("products").upsert(batch, { onConflict: "id" });
    if (error) {
      for (const row of batch) {
        const { error: rowError } = await supabase
          .from("products")
          .upsert([row], { onConflict: "id" });
        if (!rowError) productsUpdated++;
      }
    } else {
      productsUpdated += batch.length;
    }
    process.stdout.write(`  Updated ${Math.min(i + STOCK_BATCH_SIZE, productUpdates.length)}/${productUpdates.length} products\r`);
  }
  console.log(`\n✓ Updated stock_quantity for ${productsUpdated} products.\n`);

  console.log("Done!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
