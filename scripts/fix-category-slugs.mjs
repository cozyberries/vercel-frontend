#!/usr/bin/env node

/**
 * Fix category slugs to match their category names
 * 
 * The categories table has mismatched slugs - this script fixes them by generating
 * the correct slug from each category's name.
 * 
 * Usage:
 *   node scripts/fix-category-slugs.mjs [options]
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
const DRY_RUN = process.argv.includes("--dry-run");

function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

async function run() {
  console.log("🔍 Analyzing category slugs...\n");
  if (DRY_RUN) console.log("   (dry run – no changes will be written)\n");

  // Fetch all categories
  const { data: categories, error: catError } = await supabase
    .from("categories")
    .select("*")
    .order("id", { ascending: true });

  if (catError) {
    console.error("❌ Failed to fetch categories:", catError.message);
    process.exit(1);
  }

  if (!categories?.length) {
    console.error("❌ No categories found in database.");
    process.exit(1);
  }

  console.log(`📁 Found ${categories.length} categories\n`);

  // Analyze what needs to be fixed
  const updates = [];
  const alreadyCorrect = [];

  for (const category of categories) {
    const correctSlug = slugify(category.name);
    
    if (category.slug !== correctSlug) {
      updates.push({
        id: category.id,
        name: category.name,
        currentSlug: category.slug,
        correctSlug: correctSlug,
      });
    } else {
      alreadyCorrect.push(category);
    }
  }

  // Display results
  console.log("═══════════════════════════════════════════════════════════\n");
  
  if (alreadyCorrect.length > 0) {
    console.log(`✅ Categories with correct slugs (${alreadyCorrect.length}):\n`);
    alreadyCorrect.forEach(cat => {
      console.log(`   ${cat.name} → ${cat.slug}`);
    });
    console.log();
  }

  if (updates.length > 0) {
    console.log(`🔧 Categories needing slug fixes (${updates.length}):\n`);
    updates.forEach((u, idx) => {
      console.log(`${idx + 1}. ${u.name}`);
      console.log(`   ${u.currentSlug} → ${u.correctSlug}\n`);
    });
  } else {
    console.log("✅ All category slugs are correct!\n");
  }

  console.log("═══════════════════════════════════════════════════════════\n");

  // Perform updates if not dry run
  if (updates.length === 0) {
    console.log("✅ No updates needed.");
    return;
  }

  if (DRY_RUN) {
    console.log("[DRY RUN] No updates performed.");
    return;
  }

  console.log("🔄 Updating category slugs...\n");
  let success = 0;
  let failed = 0;

  for (const update of updates) {
    const { error } = await supabase
      .from("categories")
      .update({ slug: update.correctSlug })
      .eq("id", update.id);

    if (error) {
      console.error(`  ❌ ${update.name}:`, error.message);
      failed++;
    } else {
      console.log(`  ✓ ${update.name} → ${update.correctSlug}`);
      success++;
    }
  }

  console.log(`\n✅ Done! Updated ${success} category slugs.${failed ? ` ${failed} failed.` : ""}`);
  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
