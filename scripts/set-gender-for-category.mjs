#!/usr/bin/env node

/**
 * Set gender_id for all products in a given category.
 *
 * Usage:
 *   node scripts/set-gender-for-category.mjs <category-slug> <gender-name> [options]
 *
 * Example (set gender = Boy for all products in Boys Coord Sets):
 *   node scripts/set-gender-for-category.mjs boys-coord-sets Boy
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

const argv = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const DRY_RUN = process.argv.includes("--dry-run");
const categorySlug = argv[0];
const genderName = argv[1];

if (!categorySlug || !genderName) {
  console.error("Usage: node scripts/set-gender-for-category.mjs <category-slug> <gender-name> [--dry-run]");
  console.error("Example: node scripts/set-gender-for-category.mjs boys-coord-sets Boy");
  process.exit(1);
}

async function run() {
  console.log(`📁 Category: ${categorySlug}`);
  console.log(`👤 Gender: ${genderName}\n`);
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

  const { data: gender, error: genderError } = await supabase
    .from("genders")
    .select("id, name")
    .ilike("name", genderName)
    .limit(1)
    .maybeSingle();

  if (genderError || !gender) {
    console.error("❌ Gender not found:", genderName, genderError?.message || "");
    process.exit(1);
  }

  const { data: products, error: prodError } = await supabase
    .from("products")
    .select("id, name, gender_id, categories(name, slug)")
    .eq("category_id", category.id);

  if (prodError) {
    console.error("❌ Failed to fetch products:", prodError.message);
    process.exit(1);
  }

  if (!products?.length) {
    console.log(`No products found in "${category.name}" (${category.slug}). Nothing to update.`);
    return;
  }

  const alreadySet = products.filter((p) => p.gender_id === gender.id);
  const toUpdate = products.filter((p) => p.gender_id !== gender.id);

  if (alreadySet.length) {
    console.log(`✅ Already gender "${gender.name}": ${alreadySet.length} product(s)\n`);
  }

  if (toUpdate.length === 0) {
    console.log("✅ All products in this category already have that gender. Nothing to update.");
    return;
  }

  console.log(`📝 Will set gender to "${gender.name}" for ${toUpdate.length} product(s):\n`);
  toUpdate.forEach((p) => {
    console.log(`   - ${p.name} (${p.id})`);
  });
  console.log("");

  if (DRY_RUN) {
    console.log("[DRY RUN] No updates performed.");
    return;
  }

  const productIdsToUpdate = toUpdate.map((p) => p.id);
  const { error: updateError } = await supabase
    .from("products")
    .update({ gender_id: gender.id })
    .in("id", productIdsToUpdate);

  if (updateError) {
    console.error("❌ Update failed:", updateError.message);
    process.exit(1);
  }

  console.log(`✅ Set gender to "${gender.name}" for ${toUpdate.length} product(s) in "${category.name}".`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
