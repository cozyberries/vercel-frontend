#!/usr/bin/env node

/**
 * Assign color_id to product_variants that have null color_id,
 * using the product's name (title). Product names follow "PrintName - ProductType"
 * e.g. "Aloe Mist - Muslin Collar Frock" → Aloe Mist → color_id for Aloe Green.
 *
 * Usage: node scripts/assign-color-id-from-product-title.mjs [--dry-run]
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

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

// Product title first segment (print/color name) → DB color name (colors.name)
const TITLE_PREFIX_TO_DB_COLOR = {
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

/**
 * Extract print/color name from product title (segment before first " - ").
 */
function colorNameFromProductTitle(name) {
  const s = (name ?? "").trim();
  const idx = s.indexOf(" - ");
  const prefix = idx === -1 ? s : s.slice(0, idx).trim();
  return prefix || null;
}

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== LIVE RUN ===");
  console.log();

  const { data: variants, error: vErr } = await supabase
    .from("product_variants")
    .select("id, product_id")
    .is("color_id", null);

  if (vErr) throw new Error(vErr.message);

  if (!variants?.length) {
    console.log("No product_variants with null color_id. Nothing to do.");
    return;
  }

  const productIds = [...new Set(variants.map((v) => v.product_id))];
  const { data: products, error: pErr } = await supabase
    .from("products")
    .select("id, name")
    .in("id", productIds);

  if (pErr) throw new Error(pErr.message);

  const { data: colors, error: cErr } = await supabase
    .from("colors")
    .select("id, name");

  if (cErr) throw new Error(cErr.message);

  const productById = Object.fromEntries((products || []).map((p) => [p.id, p]));
  const colorByName = Object.fromEntries((colors || []).map((c) => [c.name, c.id]));

  function resolveColorId(productName) {
    const prefix = colorNameFromProductTitle(productName);
    if (!prefix) return null;
    const dbColorName = TITLE_PREFIX_TO_DB_COLOR[prefix] ?? prefix;
    return colorByName[dbColorName] ?? colorByName[prefix] ?? null;
  }

  const updates = [];
  const noColor = [];
  const noProduct = [];

  for (const v of variants) {
    const product = productById[v.product_id];
    if (!product) {
      noProduct.push(v.id);
      continue;
    }
    const colorId = resolveColorId(product.name);
    if (!colorId) {
      noColor.push({ variantId: v.id, product_id: v.product_id, productName: product.name });
      continue;
    }
    updates.push({ id: v.id, color_id: colorId });
  }

  if (noProduct.length) {
    console.log(`⚠ Variants with missing product (skipped): ${noProduct.length}`);
  }
  if (noColor.length) {
    console.log(`⚠ No color resolved for ${noColor.length} variant(s):`);
    for (const x of noColor.slice(0, 10)) {
      console.log(`   product_id=${x.product_id}  name="${x.productName?.slice(0, 50)}..."`);
    }
    if (noColor.length > 10) console.log(`   ... and ${noColor.length - 10} more`);
    console.log();
  }

  console.log(`Will set color_id for ${updates.length} variant(s).\n`);

  if (DRY_RUN) {
    const sample = updates.slice(0, 5);
    for (const u of sample) {
      const v = variants.find((x) => x.id === u.id);
      const p = v && productById[v.product_id];
      console.log(`  variant ${u.id} → color_id ${u.color_id}  (product: ${p?.name?.slice(0, 40)}...)`);
    }
    console.log("\nDRY RUN — no changes written. Rerun without --dry-run to apply.\n");
    return;
  }

  let updated = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from("product_variants")
      .update({ color_id: u.color_id })
      .eq("id", u.id);
    if (!error) updated++;
  }
  console.log(`✓ Updated color_id for ${updated} variant(s).\n`);
  console.log("Done!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
