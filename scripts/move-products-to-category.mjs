#!/usr/bin/env node

/**
 * Move specific products to a category by product IDs.
 *
 * Usage:
 *   node scripts/move-products-to-category.mjs <category-slug> [product-id ...] [options]
 *
 * Example:
 *   node scripts/move-products-to-category.mjs boys-coord-sets 81c2f9c8-01f3-4895-aed2-175b1b249119 c3e798d7-5bb3-4093-94bd-d0b089b6108b e3663aa8-677d-4e04-9780-1f27b7c36a03
 *
 * Options:
 *   --dry-run    Print what would be updated without actually updating
 *
 * Requires: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const argv = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const DRY_RUN = process.argv.includes("--dry-run");
const categorySlug = argv[0];
const productIds = argv.slice(1).filter((id) => UUID_REGEX.test(id));
const invalidIds = argv.slice(1).filter((id) => !UUID_REGEX.test(id));

if (invalidIds.length) {
  console.warn("⚠️  Invalid product ID format (expected RFC4122 UUID):", invalidIds.join(", "));
}

if (!categorySlug || !productIds.length) {
  console.error("Usage: node scripts/move-products-to-category.mjs <category-slug> <product-id> [product-id ...] [--dry-run]");
  console.error("Example: node scripts/move-products-to-category.mjs boys-coord-sets 81c2f9c8-01f3-4895-aed2-175b1b249119 c3e798d7-5bb3-4093-94bd-d0b089b6108b");
  process.exit(1);
}

async function run() {
  console.log(`📁 Target category: ${categorySlug}`);
  console.log(`📦 Product IDs to move: ${productIds.length}\n`);
  if (DRY_RUN) console.log("   (dry run – no changes will be written)\n");

  const { data: category, error: catError } = await supabase
    .from("categories")
    .select("id, name, slug")
    .eq("slug", categorySlug)
    .single();

  if (catError || !category) {
    console.error("❌ Category not found:", categorySlug, catError?.message || "");
    process.exit(1);
  }

  const { data: products, error: prodError } = await supabase
    .from("products")
    .select("id, name, category_id, categories(id, name, slug)")
    .in("id", productIds);

  if (prodError) {
    console.error("❌ Failed to fetch products:", prodError.message);
    process.exit(1);
  }

  const foundIds = new Set((products || []).map((p) => p.id));
  const missing = productIds.filter((id) => !foundIds.has(id));
  if (missing.length) {
    console.warn("⚠️  Products not found:", missing.join(", "));
  }

  if (!products?.length) {
    console.error("❌ No products found.");
    process.exit(1);
  }

  const toUpdate = products.filter(
    (p) => p.categories?.slug !== categorySlug
  );
  const alreadyCorrect = products.filter(
    (p) => p.categories?.slug === categorySlug
  );

  if (alreadyCorrect.length) {
    console.log(`✅ Already in "${category.name}": ${alreadyCorrect.map((p) => p.name).join(", ")}\n`);
  }

  if (toUpdate.length === 0) {
    console.log("✅ All specified products are already in that category. Nothing to update.");
    return;
  }

  console.log(`📝 Will set category to "${category.name}" (${category.slug}) for:\n`);
  toUpdate.forEach((p) => {
    console.log(`   - ${p.name} (${p.id})`);
    console.log(`     current: ${p.categories?.name || "(none)"}\n`);
  });

  if (DRY_RUN) {
    console.log("[DRY RUN] No updates performed.");
    return;
  }

  const { error: updateError } = await supabase
    .from("products")
    .update({ category_id: category.id })
    .in("id", toUpdate.map((p) => p.id));

  if (updateError) {
    console.error("❌ Update failed:", updateError.message);
    process.exit(1);
  }

  console.log(`✅ Updated ${toUpdate.length} product(s) to "${category.name}".`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
