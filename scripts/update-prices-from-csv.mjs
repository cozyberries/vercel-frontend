#!/usr/bin/env node

/**
 * Update Product Prices from Stock Summary CSV
 *
 * Reads the CSV stock file, maps item+print to DB products,
 * and updates product prices. Sets unmatched products to price = 1.
 *
 * Usage:
 *   node scripts/update-prices-from-csv.mjs [csv-path] [options]
 *
 * Arguments:
 *   csv-path     Optional path to Stock Summary CSV (default: ../Product Catalogue/Stocks & orders - Stock Summary.csv)
 *
 * Options:
 *   --dry-run    Print what would be updated without actually updating
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
  PYJAMAS: ["Pyjama", "Pyjama Ribbed"],
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
 * Parse CSV and extract item + print + selling price
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
    const print = (parts[2] ?? "").trim();
    const sellingPrice = parseInt(parts[8], 10) || 0;

    if (!item) continue;

    rows.push({
      item,
      print,
      sellingPrice,
    });
  }

  return rows;
}

// ── Main logic ──────────────────────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== LIVE RUN ===");
  console.log();

  // 1. Load DB products
  const productsRes = await supabase
    .from("products")
    .select("id, name, price");

  if (productsRes.error) throw productsRes.error;

  const allProducts = productsRes.data;
  
  // Detect duplicate product names and build map with first occurrence
  const nameMap = new Map();
  for (const product of allProducts) {
    if (nameMap.has(product.name)) {
      nameMap.get(product.name).push(product);
    } else {
      nameMap.set(product.name, [product]);
    }
  }
  
  // Warn about duplicates
  for (const [name, products] of nameMap.entries()) {
    if (products.length > 1) {
      console.warn(`⚠️  Duplicate product name: "${name}" (IDs: ${products.map(p => p.id).join(', ')})`);
      console.warn(`   Using first occurrence (ID: ${products[0].id})`);
    }
  }
  
  // Build productsByName using first occurrence of each name
  const productsByName = Object.fromEntries(
    Array.from(nameMap.entries()).map(([name, products]) => [name, products[0]])
  );

  console.log(`Loaded ${allProducts.length} products from Supabase\n`);

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

  // 3. Build a map of product ID → price from CSV
  const priceMap = new Map(); // product_id → price

  // Group CSV rows by (item, print) using nested maps to handle pipes in values
  const itemPrintPrices = new Map(); // Map<item, Map<print, price>>
  for (const row of csvRows) {
    if (!row.sellingPrice || row.sellingPrice === 0) continue;
    
    if (!itemPrintPrices.has(row.item)) {
      itemPrintPrices.set(row.item, new Map());
    }
    const printMap = itemPrintPrices.get(row.item);
    if (!printMap.has(row.print)) {
      printMap.set(row.print, row.sellingPrice);
    }
  }

  let totalCombinations = 0;
  for (const prints of itemPrintPrices.values()) {
    totalCombinations += prints.size;
  }
  console.log(`Found ${totalCombinations} unique item+print combinations with prices\n`);

  // 4. Map CSV rows to products
  const matched = [];
  const unmatchedCSV = [];

  for (const [item, prints] of itemPrintPrices.entries()) {
    for (const [print, price] of prints.entries()) {
      const colorName = PRINT_TO_COLOR[print];
      
      if (!colorName) {
        unmatchedCSV.push({ item, print, price, reason: `Unknown print: "${print}"` });
        continue;
      }

      const prefixes = ITEM_TO_PRODUCT_PREFIX[item];
      if (!prefixes) {
        unmatchedCSV.push({ item, print, price, reason: `No item mapping for: "${item}"` });
        continue;
      }

      let foundProduct = false;
      for (const prefix of prefixes) {
        const productName = `${prefix} - ${colorName}`;
        const product = productsByName[productName];
        if (product) {
          priceMap.set(product.id, price);
          matched.push({
            item,
            print,
            price,
            productName,
            productId: product.id,
            oldPrice: product.price,
          });
          foundProduct = true;
        }
      }

      if (!foundProduct) {
        const tried = prefixes.map((p) => `"${p} - ${colorName}"`).join(", ");
        unmatchedCSV.push({
          item,
          print,
          price,
          reason: `No product found. Tried: ${tried}`,
        });
      }
    }
  }

  // 5. Identify products not in CSV (will be set to price = 1)
  const unmatchedProducts = allProducts.filter((p) => !priceMap.has(p.id));
  
  // Safety check: abort if too many products are unmatched
  const MAX_UNMATCHED_PERCENT = 50; // Abort if more than 50% are unmatched
  const unmatchedPercent = (unmatchedProducts.length / allProducts.length) * 100;
  
  if (unmatchedPercent > MAX_UNMATCHED_PERCENT) {
    console.error(`\n❌ SAFETY CHECK FAILED: ${unmatchedProducts.length}/${allProducts.length} products (${unmatchedPercent.toFixed(1)}%) are not in CSV.`);
    console.error(`   This exceeds the safety threshold of ${MAX_UNMATCHED_PERCENT}%.`);
    console.error(`   Aborting to prevent mass-price resets.`);
    console.error(`   Please review the CSV file and mapping configuration.\n`);
    process.exit(1);
  }
  
  for (const product of unmatchedProducts) {
    priceMap.set(product.id, 1);
  }

  // 6. Report
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  MATCHED: ${matched.length} products`);
  console.log(`  UNMATCHED CSV: ${unmatchedCSV.length} rows`);
  console.log(`  UNMATCHED PRODUCTS (will be set to ₹1): ${unmatchedProducts.length}`);
  console.log("═══════════════════════════════════════════════════════\n");

  if (matched.length > 0) {
    console.log("── Matched products (will be updated) ──");
    const sortedMatches = matched.sort((a, b) => a.productName.localeCompare(b.productName));
    for (const m of sortedMatches) {
      const changeNote = m.oldPrice === m.price ? "(no change)" : `(₹${m.oldPrice} → ₹${m.price})`;
      console.log(`  ✓ ${m.productName}: ₹${m.price} ${changeNote}`);
    }
    console.log();
  }

  if (unmatchedCSV.length > 0) {
    console.log("── Unmatched CSV rows (skipped) ──");
    for (const u of unmatchedCSV) {
      console.log(`  ✗ ${u.item} + ${u.print}: ₹${u.price} | ${u.reason}`);
    }
    console.log();
  }

  if (unmatchedProducts.length > 0) {
    console.log("── Products not in CSV (will be set to ₹1) ──");
    const sortedUnmatched = unmatchedProducts.sort((a, b) => a.name.localeCompare(b.name));
    for (const p of sortedUnmatched) {
      const changeNote = p.price === 1 ? "(no change)" : `(₹${p.price} → ₹1)`;
      console.log(`  ⚠ ${p.name}: ₹1 ${changeNote}`);
    }
    console.log();
  }

  if (priceMap.size === 0) {
    console.log("No products to update. Exiting.");
    return;
  }

  // 7. Update product prices
  if (DRY_RUN) {
    console.log("DRY RUN — not updating. Rerun without --dry-run to apply.\n");
    return;
  }

  console.log("Updating product prices...");
  const updates = Array.from(priceMap.entries());

  let updated = 0;
  const progressFile = resolve(process.cwd(), "price-update-progress.log");
  const { appendFileSync, writeFileSync } = await import("fs");
  
  // Initialize progress file
  writeFileSync(progressFile, `Price update started at ${new Date().toISOString()}\n`, "utf-8");

  for (const [id, price] of updates) {
    const { error } = await supabase
      .from("products")
      .update({ price, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error(`\nError updating product ${id}:`, error);
      console.error(`Progress saved to: ${progressFile}`);
      console.error(`You can review which products were updated successfully.`);
      process.exit(1);
    }
    
    // Log successful update
    appendFileSync(progressFile, `${id}\n`, "utf-8");
    updated++;
    process.stdout.write(`  Updated ${updated}/${updates.length}\r`);
  }

  console.log(`\n✓ Updated prices for ${updated} products.\n`);
  console.log("Done!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
