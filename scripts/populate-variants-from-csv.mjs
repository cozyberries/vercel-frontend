#!/usr/bin/env node

/**
 * Populate product_variants from Stock Summary CSV
 *
 * Reads the CSV stock file, maps item+print+size to DB products/colors/sizes,
 * and inserts product_variants with correct stock quantities.
 *
 * Usage:
 *   node scripts/populate-variants-from-csv.mjs [options]
 *
 * Options:
 *   --dry-run    Print what would be inserted without actually inserting
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
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
  NUTS: "Naugthy Nuts",
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

function parseCSV(filePath) {
  const raw = readFileSync(filePath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    const item = parts[0].trim();
    const sizeRaw = parts[1].trim();
    const print = parts[2].trim();
    const totalIn = parseInt(parts[3]) || 0;
    const totalOut = parseInt(parts[4]) || 0;
    const currentStock = parseInt(parts[5]) || 0;

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

  // 2. Parse CSV
  const csvPath = resolve(
    process.cwd(),
    "../Product Catalogue/Stocks & orders - Stock Summary.csv"
  );
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

  // 5. Insert variants
  if (DRY_RUN) {
    console.log("DRY RUN — not inserting. Rerun without --dry-run to apply.\n");
    return;
  }

  // Insert new variants in batches first
  console.log("Inserting new product variants...");
  const batchSize = 50;
  let inserted = 0;
  const batchId = new Date().toISOString(); // Unique batch identifier
  
  for (let i = 0; i < variants.length; i += batchSize) {
    const batch = variants.slice(i, i + batchSize).map((v) => ({
      product_id: v.product_id,
      size_id: v.size_id,
      color_id: v.color_id,
      stock_quantity: v.stock_quantity,
      created_at: batchId, // Use batch ID for tracking
    }));

    const { error } = await supabase.from("product_variants").insert(batch);
    if (error) {
      console.error(`Error inserting batch ${i / batchSize + 1}:`, error);
      process.exit(1);
    }
    inserted += batch.length;
    process.stdout.write(`  Inserted ${inserted}/${variants.length}\r`);
  }
  console.log(`\n✓ Inserted ${inserted} product variants.\n`);

  // Delete old variants only after successful insertion
  // Using created_at filter to identify old variants (Supabase requires a where clause for bulk deletes)
  console.log("Removing old product variants...");
  const { error: deleteError } = await supabase
    .from("product_variants")
    .delete()
    .neq("created_at", batchId);
  
  if (deleteError) {
    console.error("⚠️  Error deleting old variants:", deleteError);
    console.error("   New variants have been inserted successfully, but old variants remain.");
    console.error("   You may need to manually clean up the product_variants table.");
  } else {
    console.log("✓ Removed old variants.\n");
  }

  // 6. Update product stock_quantity totals
  console.log("Updating product stock totals...");
  const stockByProduct = {};
  for (const v of variants) {
    stockByProduct[v.product_id] =
      (stockByProduct[v.product_id] || 0) + v.stock_quantity;
  }

  let updated = 0;
  for (const [productId, totalStock] of Object.entries(stockByProduct)) {
    const { error } = await supabase
      .from("products")
      .update({ stock_quantity: totalStock })
      .eq("id", productId);
    if (error) {
      console.error(`Error updating product ${productId}:`, error);
    } else {
      updated++;
    }
  }
  console.log(`✓ Updated stock_quantity for ${updated} products.\n`);

  console.log("Done!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
