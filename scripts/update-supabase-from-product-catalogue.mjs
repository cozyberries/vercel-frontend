#!/usr/bin/env node

/**
 * Update Supabase from Product Catalogue CSV
 *
 * CSV columns: Product id, Product Title, Category, Available Size, Price
 * Primary key in CSV: (product id + price). When price differs by size, product id
 * is duplicated; each row gives the price for a set of sizes.
 *
 * - Updates products: name (title), category_id, and base price (min price for that product).
 * - product_variants: truncate-and-insert per product. For each product in the catalogue,
 *   all existing variants are deleted, then only the sizes/prices from the CSV are inserted.
 *   Catalogue is the source of truth — no upsert; sizes not in the catalogue are removed.
 *
 * Usage:
 *   node scripts/update-supabase-from-product-catalogue.mjs [csv-path] [options]
 *
 * Arguments:
 *   csv-path    Optional path to Product Catalogue CSV (default: public/Product Catalogue.csv)
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
import { slugify } from "./utils/slugify.mjs";

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

const DEFAULT_CSV_PATH = resolve(process.cwd(), "public/Product Catalogue.csv");

/**
 * Normalize product id (strip leading slash if present).
 */
function normalizeProductId(raw) {
  const s = (raw ?? "").trim();
  return s.startsWith("/") ? s.slice(1) : s;
}

/**
 * Parse "Available Size" string into list of size tokens.
 * e.g. "(6-12), (1-2), (2-3)" or " (6-12),(1-2),(2-3)  " or "(0-3)"
 */
function parseAvailableSizes(availableSizeStr) {
  if (!availableSizeStr || typeof availableSizeStr !== "string") return [];
  const trimmed = availableSizeStr.trim();
  if (!trimmed) return [];
  const tokens = trimmed
    .split(/[,\s]+/)
    .map((t) => t.replace(/^\(|\)$/g, "").trim())
    .filter(Boolean);
  return [...new Set(tokens)];
}

/**
 * Parse Product Catalogue CSV.
 */
function parseCSV(filePath) {
  const raw = readFileSync(filePath, "utf-8");
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  const rows = [];
  for (const row of records) {
    const productId = normalizeProductId(row["Product id"]);
    const title = (row["Product Title"] ?? "").trim();
    const category = (row["Category"] ?? "").trim();
    const availableSize = (row["Available Size"] ?? "").trim();
    const price = parseInt(String(row["Price"] ?? "0").replace(/\D/g, ""), 10) || 0;

    if (!productId) continue;

    rows.push({
      product_id: productId,
      title,
      category,
      available_size: availableSize,
      price,
    });
  }
  return rows;
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

  const csvRows = parseCSV(csvPath);
  console.log(`Parsed ${csvRows.length} rows from ${csvPath}\n`);

  if (csvRows.length === 0) {
    console.log("No data to process.");
    return;
  }

  // Load categories and sizes from Supabase
  const [categoriesRes, sizesRes, productsRes] = await Promise.all([
    supabase.from("categories").select("id, name, slug"),
    supabase.from("sizes").select("slug, name"),
    supabase.from("products").select("id, name, price, category_id"),
  ]);

  if (categoriesRes.error) throw new Error(categoriesRes.error.message);
  if (sizesRes.error) throw new Error(sizesRes.error.message);
  if (productsRes.error) throw new Error(productsRes.error.message);

  const categories = categoriesRes.data || [];
  const sizes = sizesRes.data || [];
  const products = productsRes.data || [];

  const categoryBySlug = Object.fromEntries(
    categories.map((c) => [c.slug?.toLowerCase(), c])
  );
  const categoryByName = Object.fromEntries(
    categories.map((c) => [c.name?.toLowerCase().trim(), c])
  );

  const sizeByName = Object.fromEntries(sizes.map((s) => [s.name, s]));
  const productById = Object.fromEntries(products.map((p) => [p.id, p]));

  console.log(
    `Loaded ${categories.length} categories, ${sizes.length} sizes, ${products.length} products\n`
  );

  // Resolve category from CSV name (try name match then slug)
  function resolveCategoryId(categoryName) {
    if (!categoryName) return null;
    const byName = categoryByName[categoryName.toLowerCase().trim()];
    if (byName) return byName.id;
    const slug = slugify(categoryName);
    const bySlug = categoryBySlug[slug?.toLowerCase()];
    return bySlug?.id ?? null;
  }

  // Resolve size token to size_slug
  function resolveSizeSlug(sizeToken) {
    const dbName = SIZE_TOKEN_TO_DB_NAME[sizeToken] ?? sizeToken;
    const size = sizeByName[dbName];
    return size?.slug ?? null;
  }

  // Build product updates: one per distinct product_id (name, category_id, min price)
  const productUpdates = new Map();
  for (const row of csvRows) {
    if (!productUpdates.has(row.product_id)) {
      const categoryId = resolveCategoryId(row.category);
      productUpdates.set(row.product_id, {
        product_id: row.product_id,
        title: row.title,
        category_id: categoryId,
        prices: [],
      });
    }
    const entry = productUpdates.get(row.product_id);
    entry.prices.push(row.price);
    if (entry.category_id == null && row.category) {
      entry.category_id = resolveCategoryId(row.category);
    }
  }

  // Set base price to min of all prices for that product
  for (const entry of productUpdates.values()) {
    entry.base_price = Math.min(...entry.prices);
  }

  // Build variant price updates: (product_id, size_slug) -> price from CSV rows
  const variantPriceUpdates = new Map();
  const variantKey = (productId, sizeSlug) => `${productId}:${sizeSlug}`;

  for (const row of csvRows) {
    const sizeTokens = parseAvailableSizes(row.available_size);
    for (const token of sizeTokens) {
      const sizeSlug = resolveSizeSlug(token);
      if (!sizeSlug) {
        console.warn(
          `  ⚠ Unknown size token "${token}" for product ${row.product_id} (row price ${row.price})`
        );
        continue;
      }
    variantPriceUpdates.set(variantKey(row.product_id, sizeSlug), {
      product_id: row.product_id,
      size_slug: sizeSlug,
      price: row.price,
    });
    }
  }

  // Report and apply product updates
  const productIdsToUpdate = [];
  const missingProducts = [];
  const missingCategories = [];

  for (const [productId, entry] of productUpdates.entries()) {
    const existing = productById[productId];
    if (!existing) {
      missingProducts.push(productId);
      continue;
    }
    if (entry.category_id == null && entry.title && entry.title !== existing.name) {
      missingCategories.push(entry.title);
    }
    productIdsToUpdate.push({
      id: productId,
      name: entry.title || existing.name,
      category_id: entry.category_id ?? existing.category_id,
      price: entry.base_price,
    });
  }

  if (missingProducts.length > 0) {
    console.log(
      `⚠ Products in CSV not found in DB (${missingProducts.length}): ${missingProducts.slice(0, 5).join(", ")}${missingProducts.length > 5 ? "..." : ""}\n`
    );
  }

  // Products in DB but not in catalogue (extra in DB)
  const catalogueProductIds = new Set(productUpdates.keys());
  const inDbNotInCatalogue = products.filter((p) => !catalogueProductIds.has(p.id));
  if (inDbNotInCatalogue.length > 0) {
    console.log(`\n📋 Products in DB but NOT in catalogue (${inDbNotInCatalogue.length}):`);
    for (const p of inDbNotInCatalogue) {
      console.log(`   ${p.id}  ${p.name}`);
    }
    console.log();
  } else {
    console.log("\n📋 Products in DB but not in catalogue: none (all DB products are in catalogue).\n");
  }

  // Category vs product counts: catalogue vs DB
  const catalogueByCategory = new Map();
  for (const row of csvRows) {
    const cat = (row.category || "").trim();
    if (!cat) continue;
    if (!catalogueByCategory.has(cat)) catalogueByCategory.set(cat, new Set());
    catalogueByCategory.get(cat).add(row.product_id);
  }
  const dbByCategoryId = new Map();
  for (const p of products) {
    const cid = p.category_id;
    if (!cid) continue;
    dbByCategoryId.set(cid, (dbByCategoryId.get(cid) || 0) + 1);
  }

  console.log("═══════════════════════════════════════════════════════");
  console.log("  Category vs product counts (Catalogue vs DB)");
  console.log("═══════════════════════════════════════════════════════\n");

  // Map catalogue category name -> DB category_id (from any product in that catalogue category)
  const catalogueCatNameToDbId = new Map();
  const productIdToCategoryId = new Map(productIdsToUpdate.map((p) => [p.id, p.category_id]));
  for (const catName of catalogueByCategory.keys()) {
    const productIdsInCat = catalogueByCategory.get(catName);
    for (const pid of productIdsInCat) {
      const cid = productIdToCategoryId.get(pid);
      if (cid) {
        catalogueCatNameToDbId.set(catName, cid);
        break;
      }
    }
  }

  const categoryNames = [...catalogueByCategory.keys()].sort();
  let categoriesMatch = true;
  for (const catName of categoryNames) {
    const catalogueCount = catalogueByCategory.get(catName).size;
    const catId = catalogueCatNameToDbId.get(catName) || resolveCategoryId(catName);
    const dbCount = catId ? (dbByCategoryId.get(catId) || 0) : 0;
    const match = catalogueCount === dbCount;
    if (!match) categoriesMatch = false;
    const status = match ? "✓" : "✗";
    const dbCatName = catId ? (categories.find((c) => c.id === catId)?.name ?? catId) : "—";
    console.log(`  ${status}  ${catName}`);
    console.log(`      Catalogue: ${catalogueCount} products   DB (${dbCatName}): ${dbCount} products${!match ? "  MISMATCH" : ""}`);
  }

  // DB categories that have products but no catalogue category maps to them
  const catalogueDbCategoryIds = new Set(catalogueCatNameToDbId.values());
  const dbCategoryIdsWithProducts = new Set(dbByCategoryId.keys());
  const onlyInDb = [...dbCategoryIdsWithProducts].filter((id) => !catalogueDbCategoryIds.has(id));
  if (onlyInDb.length > 0) {
    console.log("\n  Categories in DB with products but not in catalogue:");
    for (const cid of onlyInDb) {
      const cat = categories.find((c) => c.id === cid);
      console.log(`     "${cat?.name ?? "?"}"  ${dbByCategoryId.get(cid)} products`);
    }
  }

  console.log("\n───────────────────────────────────────────────────────");
  console.log(categoriesMatch && onlyInDb.length === 0 ? "  Result: Category counts match." : "  Result: Some category counts differ or DB has extra categories.");
  console.log();

  const variantsByProductCount = new Map();
  for (const v of variantPriceUpdates.values()) {
    variantsByProductCount.set(v.product_id, (variantsByProductCount.get(v.product_id) || 0) + 1);
  }
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Products to update: ${productIdsToUpdate.length}`);
  console.log(`  Variants: truncate per product, then insert ${variantPriceUpdates.size} rows (catalogue sizes only)`);
  console.log("═══════════════════════════════════════════════════════\n");

  if (DRY_RUN) {
    console.log("── Sample product updates ──");
    for (const p of productIdsToUpdate.slice(0, 10)) {
      const old = productById[p.id];
      const variantCount = variantsByProductCount.get(p.id) || 0;
      console.log(
        `  ${p.id}: name="${p.name}", category_id=${p.category_id ?? "unchanged"}, price=${p.price} (was ${old?.price}); variants: ${variantCount} sizes (replace all)`
      );
    }
    console.log("\n── Sample variant rows (after truncate, these will be inserted) ──");
    const variantList = [...variantPriceUpdates.entries()].slice(0, 10);
    for (const [key, v] of variantList) {
      console.log(`  product=${v.product_id} size=${v.size_slug} → price=${v.price}`);
    }
    console.log("\nDRY RUN — no changes written. Rerun without --dry-run to apply.\n");
    return;
  }

  // Apply product updates
  let productsUpdated = 0;
  for (const p of productIdsToUpdate) {
    const { error } = await supabase
      .from("products")
      .update({
        name: p.name,
        category_id: p.category_id,
        price: p.price,
        updated_at: new Date().toISOString(),
      })
      .eq("id", p.id);

    if (error) {
      console.error(`❌ Failed to update product ${p.id}:`, error.message);
    } else {
      productsUpdated++;
      process.stdout.write(`  Products updated: ${productsUpdated}/${productIdsToUpdate.length}\r`);
    }
  }
  console.log(`\n✓ Updated ${productsUpdated} products.`);

  // Truncate-and-insert variants per product: delete all variants for the product, then insert only catalogue sizes
  const variantsByProduct = new Map();
  for (const v of variantPriceUpdates.values()) {
    if (!variantsByProduct.has(v.product_id)) {
      variantsByProduct.set(v.product_id, []);
    }
    variantsByProduct.get(v.product_id).push({ size_slug: v.size_slug, price: v.price });
  }

  let productsProcessed = 0;
  let totalInserted = 0;

  for (const p of productIdsToUpdate) {
    const productId = p.id;
    const toInsert = variantsByProduct.get(productId) || [];

    const { error: deleteErr } = await supabase
      .from("product_variants")
      .delete()
      .eq("product_id", productId);

    if (deleteErr) {
      console.error(`❌ Failed to delete variants for product ${productId}:`, deleteErr.message);
      continue;
    }

    if (toInsert.length === 0) {
      process.stdout.write(`  Variants: ${productsProcessed + 1}/${productIdsToUpdate.length} products (${productId}: 0 sizes)\r`);
      productsProcessed++;
      continue;
    }

    const rows = toInsert.map(({ size_slug, price }) => ({
      product_id: productId,
      size_slug,
      color_id: null,
      price,
      stock_quantity: 0,
    }));

    const { error: insertErr } = await supabase
      .from("product_variants")
      .insert(rows);

    if (insertErr) {
      console.error(`❌ Failed to insert variants for product ${productId}:`, insertErr.message);
    } else {
      totalInserted += rows.length;
    }
    productsProcessed++;
    process.stdout.write(
      `  Variants: ${productsProcessed}/${productIdsToUpdate.length} products, ${totalInserted} variant rows\r`
    );
  }

  console.log(
    `\n✓ Truncate-and-insert complete: ${productsProcessed} products, ${totalInserted} variant rows (catalogue sizes only).`
  );

  // Validate each product: DB variants must match catalogue (sizes + prices)
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  VALIDATION (each product id vs catalogue)");
  console.log("═══════════════════════════════════════════════════════\n");

  const productIds = productIdsToUpdate.map((p) => p.id);
  const { data: dbVariants, error: fetchValErr } = await supabase
    .from("product_variants")
    .select("product_id, size_slug, price")
    .in("product_id", productIds);

  if (fetchValErr) {
    console.error("❌ Validation: failed to fetch variants:", fetchValErr.message);
  } else {
    const sizeBySlug = Object.fromEntries((sizesRes.data || []).map((s) => [s.slug, s.name]));
    const byProduct = new Map();
    for (const v of dbVariants || []) {
      if (!byProduct.has(v.product_id)) byProduct.set(v.product_id, []);
      byProduct.get(v.product_id).push({ size_slug: v.size_slug, size_name: sizeBySlug[v.size_slug] || v.size_slug, price: v.price });
    }

    let ok = 0;
    const issues = [];

    for (const p of productIdsToUpdate) {
      const productId = p.id;
      const expected = variantsByProduct.get(productId) || [];
      const actual = byProduct.get(productId) || [];

      const missing = expected.filter((e) => !actual.some((a) => a.size_slug === e.size_slug));
      const extra = actual.filter((a) => !expected.some((e) => e.size_slug === a.size_slug));
      const wrongPrice = expected.filter((e) => {
        const a = actual.find((x) => x.size_slug === e.size_slug);
        return a && a.price !== e.price;
      });

      if (missing.length === 0 && extra.length === 0 && wrongPrice.length === 0) {
        ok++;
        console.log(`  ✓ ${productId}  ${p.name?.slice(0, 40) ?? ""}...  ${actual.length} sizes OK`);
      } else {
        const parts = [];
        if (missing.length) parts.push(`missing: ${missing.map((m) => sizeBySlug[m.size_slug] || m.size_slug).join(", ")}`);
        if (extra.length) parts.push(`extra: ${extra.map((e) => e.size_name || e.size_slug).join(", ")}`);
        if (wrongPrice.length) parts.push(`wrong price: ${wrongPrice.map((w) => `${sizeBySlug[w.size_slug]}=${w.price}`).join(", ")}`);
        console.log(`  ✗ ${productId}  ${p.name?.slice(0, 40) ?? ""}  ${parts.join("; ")}`);
        issues.push({ productId, name: p.name, missing, extra, wrongPrice });
      }
    }

    console.log("\n───────────────────────────────────────────────────────");
    console.log(`  Result: ${ok}/${productIdsToUpdate.length} products match catalogue.`);
    if (issues.length > 0) {
      console.log(`  Issues: ${issues.length} product(s) with mismatch.`);
    } else {
      console.log("  All product IDs validated.");
    }
  }

  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
