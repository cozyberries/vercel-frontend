#!/usr/bin/env node

/**
 * Fix product categories by assigning them based on product titles
 * 
 * Maps products to the correct category based on their name/title.
 * 
 * Usage:
 *   node scripts/fix-product-categories.mjs [options]
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

/**
 * Category mapping based on product name patterns
 * Order matters - more specific patterns should come first
 */
const CATEGORY_PATTERNS = [
  // Newborn Essentials Kit
  {
    pattern: /newborn.*essentials?|essentials?.*kit/i,
    categorySlug: 'newborn-essentials',
    categoryName: 'Newborn Essentials'
  },
  // Pyjamas - check before "full sleeve" to catch specific variants
  {
    pattern: /pyjama|pajama/i,
    categorySlug: 'pyjamas',
    categoryName: 'Pyjamas'
  },
  // Frocks - various types
  {
    pattern: /frock/i,
    categorySlug: 'frocks',
    categoryName: 'Frocks'
  },
  // Coord Sets - distinguish boys and girls
  {
    pattern: /coord.*set.*boy|boy.*coord.*set|rocket.*ranger/i,
    categorySlug: 'boys-coord-sets',
    categoryName: 'Boys Coord Sets'
  },
  // Girls coord sets: require "girl"/"girls" so boys items are not misclassified (boys pattern runs first)
  {
    pattern: /(coord.*set.*(girl|girls)|(girl|girls).*coord.*set)/i,
    categorySlug: 'girls-coord-sets',
    categoryName: 'Girls Coord Sets'
  },
  // Rompers
  {
    pattern: /romper/i,
    categorySlug: 'rompers',
    categoryName: 'Rompers'
  },
  // Jabla and Shorts - Half Sleeve (check before sleeveless)
  {
    pattern: /jhabla.*shorts.*half.*sleeve|half.*sleeve.*jhabla.*shorts|jhabla.*&.*shorts.*half/i,
    categorySlug: 'half-sleeve-jabla-and-shorts',
    categoryName: 'Half-Sleeve Jabla and Shorts'
  },
  // Jabla and Shorts - Sleeveless (includes both explicit "sleeveless" and those without any sleeve indicator)
  {
    pattern: /jhabla.*&.*shorts|jhabla.*shorts/i,
    categorySlug: 'sleeveless-jabla-and-shorts',
    categoryName: 'Sleeveless Jabla and Shorts'
  },
  // Sleeveless Jablas (standalone, not with shorts)
  {
    pattern: /jhabla.*sleeveless|sleeveless.*jhabla/i,
    categorySlug: 'sleeveless-jablas',
    categoryName: 'Sleeveless Jablas'
  },
];

/**
 * Determine the correct category for a product based on its name
 */
function getCategoryForProduct(productName) {
  for (const mapping of CATEGORY_PATTERNS) {
    if (mapping.pattern.test(productName)) {
      return {
        slug: mapping.categorySlug,
        name: mapping.categoryName
      };
    }
  }
  return null;
}

async function run() {
  console.log("🔍 Analyzing product categories...\n");
  if (DRY_RUN) console.log("   (dry run – no changes will be written)\n");

  // Fetch all categories
  const { data: categories, error: catError } = await supabase
    .from("categories")
    .select("id, name, slug")
    .order("id", { ascending: true });

  if (catError) {
    console.error("❌ Failed to fetch categories:", catError.message);
    process.exit(1);
  }

  if (!categories?.length) {
    console.error("❌ No categories found in database.");
    process.exit(1);
  }

  console.log(`📁 Found ${categories.length} categories:`);
  categories.forEach(cat => {
    console.log(`   - ${cat.name} (${cat.slug})`);
  });
  console.log();

  // Create a map for quick lookup
  const categoryMap = new Map(
    categories.map(cat => [cat.slug, cat])
  );

  // Fetch all products
  const { data: products, error: prodError } = await supabase
    .from("products")
    .select("id, name, category_id, categories(id, name, slug)")
    .order("name", { ascending: true });

  if (prodError) {
    console.error("❌ Failed to fetch products:", prodError.message);
    process.exit(1);
  }

  if (!products?.length) {
    console.error("❌ No products found in database.");
    process.exit(1);
  }

  console.log(`📦 Found ${products.length} products\n`);

  // Analyze products and determine required updates
  const updates = [];
  const unmapped = [];
  const alreadyCorrect = [];

  for (const product of products) {
    const suggestedCategory = getCategoryForProduct(product.name);
    
    if (!suggestedCategory) {
      unmapped.push(product);
      continue;
    }

    const targetCategory = categoryMap.get(suggestedCategory.slug);
    
    if (!targetCategory) {
      console.warn(`⚠️  Category "${suggestedCategory.slug}" not found in database for product: ${product.name}`);
      unmapped.push(product);
      continue;
    }

    const currentCategorySlug = product.categories?.slug;
    
    if (currentCategorySlug === suggestedCategory.slug) {
      alreadyCorrect.push({
        product,
        category: suggestedCategory
      });
    } else {
      updates.push({
        productId: product.id,
        productName: product.name,
        currentCategory: product.categories?.name || '(none)',
        newCategory: targetCategory.name,
        newCategoryId: targetCategory.id,
      });
    }
  }

  // Display results
  console.log("═══════════════════════════════════════════════════════════\n");
  
  if (alreadyCorrect.length > 0) {
    console.log(`✅ ${alreadyCorrect.length} products already have correct categories\n`);
  }

  if (updates.length > 0) {
    console.log(`📝 Products to update (${updates.length}):\n`);
    updates.forEach((u, idx) => {
      console.log(`${idx + 1}. ${u.productName}`);
      console.log(`   ${u.currentCategory} → ${u.newCategory}\n`);
    });
  } else {
    console.log("✅ All mapped products already have correct categories!\n");
  }

  if (unmapped.length > 0) {
    console.log(`⚠️  Products without category mapping (${unmapped.length}):\n`);
    unmapped.forEach((p, idx) => {
      console.log(`${idx + 1}. ${p.name}`);
      console.log(`   Current: ${p.categories?.name || '(none)'}\n`);
    });
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

  console.log("🔄 Updating products...\n");
  let success = 0;
  let failed = 0;

  for (const update of updates) {
    const { error } = await supabase
      .from("products")
      .update({ category_id: update.newCategoryId })
      .eq("id", update.productId);

    if (error) {
      console.error(`  ❌ ${update.productName}:`, error.message);
      failed++;
    } else {
      console.log(`  ✓ ${update.productName} → ${update.newCategory}`);
      success++;
    }
  }

  console.log(`\n✅ Done! Updated ${success} products.${failed ? ` ${failed} failed.` : ""}`);
}

run().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
