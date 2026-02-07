#!/usr/bin/env node

/**
 * Populate product_variants from Stock Summary CSV
 *
 * Reads the CSV stock file, maps item+print+size to DB products/colors/sizes,
 * and inserts product_variants with correct stock quantities.
 *
 * Usage:
 *   node scripts/populate-variants-from-csv.mjs [csv-path] [options]
 *
 * Arguments:
 *   csv-path     Optional path to Stock Summary CSV (default: ../Product Catalogue/Stocks & orders - Stock Summary.csv)
 *
 * Options:
 *   --dry-run    Print what would be inserted without actually inserting
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
  console.error("   SUPABASE_SERVICE_ROLE_KEY is required for bulk operations (anon key is insufficient)");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const DRY_RUN = process.argv.includes("--dry-run");

// ── Mapping tables ──────────────────────────────────────────────────────────

/** CSV print name → DB color name */
const PRINT_TO_COLOR = {
  ORANGE: "Joyful Orbs",
  MOON: "Moons And Stars",
  MUSHROOM: "Mushie Mini",
  POPSICLES: "Popsicles",
  PINE: "Pine Cone",
  PEAR: "Soft Pear",
  DAISY: "Lilac Blossom",
  "3 ROSES": "Petal Pops",
  GREEN: "Aloe Green",
  PINK: "Pastel Pink",
  PEACH: "Peach",
  "COCONUT MILK": "Coconut Milk",
  ROCKET: "Rocket Rangers",
  NUTS: "Naughty Nuts",
};

/** CSV size label → DB size name */
const SIZE_MAP = {
  "0-3": "0-3M",
  "3-6": "3-6M",
  "6-12": "6-12M",
  "1-2": "1-2Y",
  "2-3": "2-3Y",
  "3-4": "3-4Y",
  "4-5": "4-5Y",
  "5-6": "5-6Y",
};

/**
 * CSV item name → DB product name prefix(es).
 * If an item maps to multiple DB types (like Pyjamas), list them all.
 * The script will match against whichever product actually exists in the DB.
 */
const ITEM_TO_PRODUCT_PREFIX = {
  "GIRLS ROMPERS": ["Rompers - Girls Only Loose Fit"],
  "KNEE LENGTH ROMPERS": ["Rompers - Unisex Half Sleeve"],
  "GIRLS COLLAR FROCK": ["Frock Modern"],
  "GIRLS J.PAN COLLAR FROCK": ["Frock Japanese"],
  "FRILL SLEEVE FROCK": ["Frock Butterfly Sleeve"],
  "SLEEVELESS FROCK": ["Frock Sleeveless"],
  PYJAMAS: ["Pyjamas Classic", "Pyjamas Ribbed"],
  "BOYS CO ORDS": ["Coords Set Half Sleeve"],
  "JHABLA AND SHORTS-SLEEVELESS": ["Jhabla & Shorts Sleeveless"],
  "JHABLA AND SHORTS-HALF SLEEVES": ["Jhabla & Shorts Half Sleeve"],
  "GIRLS COORDS-HONCHO": ["Coords Set Chinese Collar"],
  "GIRLS COORDS-LAYERED": ["Coords Set Layered"],
  "GIRLS COORDS-RUFFLE": ["Coords Set Ruffle"],
  "NB- JHABLA KNOTTED": ["Jhabla Knotted"],
  "NB- JHABLA SLEEVELESS": ["Jhabla Sleeveless"],
  "NB- JHABLA HALF SLEEVES": ["Jhabla Half Sleeve"],
  "NB- SHORTS": ["Newborn Shorts"],
  "NB-NAPPY": ["Newborn Nappy"],
  "NB-CAP": ["Newborn Cap"],
  "NB-MITTENS": ["Newborn Mittens"],
  "NB-BOOTIES": ["Newborn Booties"],
  TOWEL: ["Towel"],
  SWADDLE: ["Swaddle"],
  BLANKET: ["Blanket"],
};

// ── CSV parsing ─────────────────────────────────────────────────────────────

const DEFAULT_CSV_PATH = resolve(
  process.cwd(),
  "../Product Catalogue/Stocks & orders - Stock Summary.csv"
);

/**
 * Parse CSV with proper handling of quoted fields and embedded commas.
 * Expects a header row; data rows are parsed via csv-parse.
 * Numeric columns use radix 10.
 */
function parseCSV(filePath) {
  const raw = readFileSync(filePath, "utf-8");
  const records = parse(raw, {
    from_line: 2,
    relax_column_count: true,
    trim: true,
    skip_empty_lines: true,
  });

  const rows = [];
  for (const parts of records) {
    const item = (parts[0] ?? "").trim();
    const sizeRaw = (parts[1] ?? "").trim();
    const print = (parts[2] ?? "").trim();
    const totalIn = parseInt(parts[3], 10) || 0;
    const totalOut = parseInt(parts[4], 10) || 0;
    const currentStock = parseInt(parts[5], 10) || 0;

    if (!item) continue;

    rows.push({
      item,
      size: sizeRaw,
      print,
      totalIn,
      totalOut,
      currentStock,
    });
  }

  return rows;
}

// ── Main logic ──────────────────────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== LIVE RUN ===");
  console.log();

  // 1. Load DB reference data
  const [productsRes, sizesRes, colorsRes] = await Promise.all([
    supabase.from("products").select("id, name"),
    supabase.from("sizes").select("id, name, display_order"),
    supabase.from("colors").select("id, name"),
  ]);

  if (productsRes.error) throw productsRes.error;
  if (sizesRes.error) throw sizesRes.error;
  if (colorsRes.error) throw colorsRes.error;

  const productsByName = Object.fromEntries(
    productsRes.data.map((p) => [p.name, p.id])
  );
  const sizesByName = Object.fromEntries(
    sizesRes.data.map((s) => [s.name, s.id])
  );
  const colorsByName = Object.fromEntries(
    colorsRes.data.map((c) => [c.name, c.id])
  );

  console.log(
    `Loaded ${productsRes.data.length} products, ${sizesRes.data.length} sizes, ${colorsRes.data.length} colors\n`
  );

  // 2. Parse CSV (path from CLI or default)
  const positionalArgs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const csvPath = positionalArgs[0]
    ? resolve(process.cwd(), positionalArgs[0])
    : DEFAULT_CSV_PATH;

  if (!existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    console.error("   Provide a path as the first argument or ensure the default file exists.");
    process.exit(1);
  }

  const csvRows = parseCSV(csvPath);
  console.log(`Parsed ${csvRows.length} CSV rows\n`);

  // 3. Map CSV rows to variants
  const variants = [];
  const matched = [];
  const unmatched = [];

  for (const row of csvRows) {
    const colorName = PRINT_TO_COLOR[row.print];
    if (!colorName) {
      unmatched.push({ ...row, reason: `Unknown print: "${row.print}"` });
      continue;
    }

    const colorId = colorsByName[colorName];
    if (!colorId) {
      unmatched.push({
        ...row,
        reason: `Color not in DB: "${colorName}" (from print "${row.print}")`,
      });
      continue;
    }

    // Size (may be empty for items like TOWEL, SWADDLE, BLANKET)
    let sizeId = null;
    if (row.size) {
      const sizeName = SIZE_MAP[row.size];
      if (!sizeName) {
        unmatched.push({
          ...row,
          reason: `Unknown size: "${row.size}"`,
        });
        continue;
      }
      sizeId = sizesByName[sizeName];
      if (!sizeId) {
        unmatched.push({
          ...row,
          reason: `Size not in DB: "${sizeName}" (from "${row.size}")`,
        });
        continue;
      }
    }

    // Find matching product(s)
    const prefixes = ITEM_TO_PRODUCT_PREFIX[row.item];
    if (!prefixes) {
      unmatched.push({
        ...row,
        reason: `No item mapping for: "${row.item}"`,
      });
      continue;
    }

    let foundProduct = false;
    for (const prefix of prefixes) {
      const productName = `${prefix} - ${colorName}`;
      const productId = productsByName[productName];
      if (productId) {
        variants.push({
          product_id: productId,
          size_id: sizeId,
          color_id: colorId,
          stock_quantity: row.currentStock,
          _meta: {
            csvItem: row.item,
            csvPrint: row.print,
            csvSize: row.size,
            productName,
          },
        });
        matched.push({
          ...row,
          productName,
        });
        foundProduct = true;
      }
    }

    if (!foundProduct) {
      const tried = prefixes
        .map((p) => `"${p} - ${colorName}"`)
        .join(", ");
      unmatched.push({
        ...row,
        reason: `No product found. Tried: ${tried}`,
      });
    }
  }

  // 4. Report
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  MATCHED: ${matched.length} rows → ${variants.length} variants`);
  console.log(`  UNMATCHED: ${unmatched.length} rows`);
  console.log("═══════════════════════════════════════════════════════\n");

  if (matched.length > 0) {
    console.log("── Matched products ──");
    const productSummary = {};
    for (const m of matched) {
      if (!productSummary[m.productName]) {
        productSummary[m.productName] = { sizes: [], totalStock: 0 };
      }
      productSummary[m.productName].sizes.push(
        `${m.size || "one-size"}(${m.currentStock})`
      );
      productSummary[m.productName].totalStock += m.currentStock;
    }
    for (const [name, info] of Object.entries(productSummary).sort()) {
      console.log(
        `  ✓ ${name}: total=${info.totalStock}, sizes=[${info.sizes.join(", ")}]`
      );
    }
    console.log();
  }

  if (unmatched.length > 0) {
    console.log("── Unmatched rows (skipped) ──");
    const groupedUnmatched = {};
    for (const u of unmatched) {
      const key = `${u.item} + ${u.print}`;
      if (!groupedUnmatched[key]) {
        groupedUnmatched[key] = { reason: u.reason, sizes: [], totalStock: 0 };
      }
      groupedUnmatched[key].sizes.push(
        `${u.size || "one-size"}(${u.currentStock})`
      );
      groupedUnmatched[key].totalStock += u.currentStock;
    }
    for (const [key, info] of Object.entries(groupedUnmatched).sort()) {
      console.log(
        `  ✗ ${key}: ${info.reason} | sizes=[${info.sizes.join(", ")}]`
      );
    }
    console.log();
  }

  if (variants.length === 0) {
    console.log("No variants to insert. Exiting.");
    return;
  }

  // 5. Insert/Update variants using upsert
  if (DRY_RUN) {
    console.log("DRY RUN — not inserting. Rerun without --dry-run to apply.\n");
    return;
  }

  // Upsert variants using unique constraint on (product_id, size_id, color_id)
  console.log("Upserting product variants...");
  const batchSize = 50;
  let upserted = 0;
  
  for (let i = 0; i < variants.length; i += batchSize) {
    const batch = variants.slice(i, i + batchSize).map((v) => ({
      product_id: v.product_id,
      size_id: v.size_id,
      color_id: v.color_id,
      stock_quantity: v.stock_quantity,
    }));

    const { error } = await supabase
      .from("product_variants")
      .upsert(batch, { 
        onConflict: "product_id,size_id,color_id",
        ignoreDuplicates: false 
      });
    
    if (error) {
      console.error(`Error upserting batch ${i / batchSize + 1}:`, error);
      process.exit(1);
    }
    upserted += batch.length;
    process.stdout.write(`  Upserted ${upserted}/${variants.length}\r`);
  }
  console.log(`\n✓ Upserted ${upserted} product variants.\n`);

  // 6. Update product stock_quantity totals (batched upsert)
  console.log("Updating product stock totals...");
  const stockByProduct = {};
  for (const v of variants) {
    stockByProduct[v.product_id] =
      (stockByProduct[v.product_id] || 0) + v.stock_quantity;
  }

  const stockUpdates = Object.entries(stockByProduct).map(([id, stock_quantity]) => ({
    id,
    stock_quantity,
  }));

  const STOCK_BATCH_SIZE = 50;
  let updated = 0;
  const failures = [];

  for (let i = 0; i < stockUpdates.length; i += STOCK_BATCH_SIZE) {
    const batch = stockUpdates.slice(i, i + STOCK_BATCH_SIZE);
    const { error } = await supabase
      .from("products")
      .upsert(batch, { onConflict: "id" });

    if (error) {
      for (const row of batch) {
        failures.push({ id: row.id, error: error.message });
      }
    } else {
      updated += batch.length;
    }
    process.stdout.write(`  Updated ${updated}/${stockUpdates.length} products\r`);
  }

  if (failures.length > 0) {
    console.error("\n❌ Failed to update product stock for:");
    for (const { id, error } of failures) {
      console.error(`   ${id}: ${error}`);
    }
    process.exit(1);
  }
  console.log(`\n✓ Updated stock_quantity for ${updated} products.\n`);

  console.log("Done!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
