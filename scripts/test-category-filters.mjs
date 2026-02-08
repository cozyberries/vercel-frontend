#!/usr/bin/env node

/**
 * Comprehensive test for category filters
 * 
 * This script tests:
 * 1. All category slugs match their names
 * 2. All products are correctly assigned to categories
 * 3. Category filter functionality works correctly
 * 
 * Usage:
 *   node scripts/test-category-filters.mjs
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

function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

async function testCategorySlugs() {
  console.log("🔍 Test 1: Verifying category slugs match names...\n");
  
  const { data: categories, error } = await supabase
    .from("categories")
    .select("id, name, slug")
    .order("name");

  if (error) {
    console.error("❌ Failed to fetch categories:", error.message);
    return false;
  }

  let allCorrect = true;
  for (const cat of categories) {
    const expectedSlug = slugify(cat.name);
    if (cat.slug === expectedSlug) {
      console.log(`  ✅ ${cat.name.padEnd(35)} → ${cat.slug}`);
    } else {
      console.log(`  ❌ ${cat.name.padEnd(35)} → ${cat.slug} (expected: ${expectedSlug})`);
      allCorrect = false;
    }
  }

  console.log();
  return allCorrect;
}

async function testProductCategories() {
  console.log("🔍 Test 2: Verifying all products have valid categories...\n");
  
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, category_id, categories(name, slug)")
    .order("name");

  if (error) {
    console.error("❌ Failed to fetch products:", error.message);
    return false;
  }

  let allHaveCategory = true;
  let orphanedProducts = [];

  for (const product of products) {
    if (!product.category_id || !product.categories) {
      orphanedProducts.push(product);
      allHaveCategory = false;
    }
  }

  if (allHaveCategory) {
    console.log(`  ✅ All ${products.length} products have valid categories\n`);
  } else {
    console.log(`  ❌ Found ${orphanedProducts.length} products without valid categories:\n`);
    orphanedProducts.forEach(p => {
      console.log(`     - ${p.name} (ID: ${p.id})`);
    });
    console.log();
  }

  return allHaveCategory;
}

async function testCategoryFiltering() {
  console.log("🔍 Test 3: Testing category filter functionality...\n");
  
  const { data: categories, error: catError } = await supabase
    .from("categories")
    .select("id, name, slug")
    .order("name");

  if (catError) {
    console.error("❌ Failed to fetch categories:", catError.message);
    return false;
  }

  let allFiltersWork = true;

  for (const cat of categories) {
    // Test filtering by category_id
    const { data: productsBySlug, count, error } = await supabase
      .from("products")
      .select("id, name, categories(name, slug)", { count: "exact" })
      .eq("category_id", cat.id);

    if (error) {
      console.log(`  ❌ ${cat.name.padEnd(35)}: Filter failed - ${error.message}`);
      allFiltersWork = false;
      continue;
    }

    // Verify all returned products actually belong to this category
    let correctAssignment = true;
    for (const product of productsBySlug || []) {
      if (product.categories?.slug !== cat.slug) {
        console.log(`     ⚠️  Product "${product.name}" returned but has category "${product.categories?.slug}"`);
        correctAssignment = false;
      }
    }

    if (correctAssignment) {
      console.log(`  ✅ ${cat.name.padEnd(35)} (${cat.slug.padEnd(35)}): ${count || 0} products`);
    } else {
      console.log(`  ❌ ${cat.name.padEnd(35)}: Some products incorrectly assigned`);
      allFiltersWork = false;
    }
  }

  console.log();
  return allFiltersWork;
}

async function testProductDistribution() {
  console.log("🔍 Test 4: Product distribution across categories...\n");
  
  const { data: categories, error: catError } = await supabase
    .from("categories")
    .select("id, name, slug")
    .order("name");

  if (catError) {
    console.error("  ❌ Failed to fetch categories:", catError.message);
    return false;
  }
  if (!categories?.length) {
    console.error("  ❌ No categories returned.");
    return false;
  }

  let totalProducts = 0;
  const distribution = [];

  for (const cat of categories) {
    const { count } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("category_id", cat.id);

    distribution.push({ category: cat.name, count: count || 0 });
    totalProducts += count || 0;
  }

  distribution.forEach(({ category, count }) => {
    const percentage = totalProducts > 0 ? ((count / totalProducts) * 100).toFixed(1) : "0.0";
    console.log(`  ${category.padEnd(35)}: ${String(count).padStart(3)} products (${percentage.padStart(5)}%)`);
  });

  console.log(`  ${"".padEnd(35, "-")}   ${"".padEnd(3, "-")}`);
  console.log(`  ${"Total".padEnd(35)}: ${String(totalProducts).padStart(3)} products\n`);

  return totalProducts > 0;
}

async function runTests() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("     CATEGORY FILTER COMPREHENSIVE TEST SUITE");
  console.log("═══════════════════════════════════════════════════════════\n");

  const test1 = await testCategorySlugs();
  const test2 = await testProductCategories();
  const test3 = await testCategoryFiltering();
  const test4 = await testProductDistribution();

  console.log("═══════════════════════════════════════════════════════════");
  console.log("                    TEST RESULTS");
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log(`  Test 1 - Category Slugs:        ${test1 ? "✅ PASSED" : "❌ FAILED"}`);
  console.log(`  Test 2 - Product Categories:    ${test2 ? "✅ PASSED" : "❌ FAILED"}`);
  console.log(`  Test 3 - Category Filtering:    ${test3 ? "✅ PASSED" : "❌ FAILED"}`);
  console.log(`  Test 4 - Product Distribution:  ${test4 ? "✅ PASSED" : "❌ FAILED"}`);

  const allPassed = test1 && test2 && test3 && test4;
  
  console.log("\n═══════════════════════════════════════════════════════════");
  if (allPassed) {
    console.log("🎉 ALL TESTS PASSED! Category filters are working correctly.");
  } else {
    console.log("⚠️  SOME TESTS FAILED. Please review the errors above.");
  }
  console.log("═══════════════════════════════════════════════════════════\n");

  process.exit(allPassed ? 0 : 1);
}

runTests().catch((err) => {
  console.error("❌ Test suite error:", err);
  process.exit(1);
});
