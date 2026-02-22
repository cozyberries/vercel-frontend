#!/usr/bin/env node

/**
 * Export Denormalized Product Catalog to CSV
 *
 * Creates a single comprehensive CSV file with all product information in denormalized format:
 * - Product details (ID, name, description, price, slug)
 * - Category information
 * - Variant details (size, color, variant stock)
 * - Total stock quantities
 * - Images
 * - Timestamps
 *
 * Each row represents a product variant (or product if no variants exist).
 * All product information is repeated for each variant.
 *
 * Usage:
 *   node scripts/export-product-catalog-csv.mjs [output-file]
 *
 * Arguments:
 *   output-file    Optional path for output CSV file (default: product-catalog-{timestamp}.csv)
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";

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

/** Page size for Supabase range queries; fetch until a page returns fewer than this. */
const PAGE_SIZE = 1000;

// Helper to parse images field
function parseImages(images) {
  try {
    if (!images) return [];
    if (typeof images === "string") {
      return JSON.parse(images);
    }
    if (Array.isArray(images)) return images;
    return [];
  } catch {
    return [];
  }
}

// Helper to format date
function formatDate(date) {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

// Helper to escape CSV values
function escapeCsvValue(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // If contains comma, newline, or quote, wrap in quotes and escape quotes
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function fetchProductCatalog() {
  console.log("Fetching products...");

  const productSelect = `
      id,
      name,
      description,
      price,
      slug,
      stock_quantity,
      is_featured,
      images,
      created_at,
      updated_at,
      category_id,
      categories (
        id,
        name,
        slug
      )
    `;

  const products = [];
  let productStart = 0;
  while (true) {
    const productEnd = productStart + PAGE_SIZE - 1;
    const { data: page, error: productsError } = await supabase
      .from("products")
      .select(productSelect)
      .order("name", { ascending: true })
      .range(productStart, productEnd);

    if (productsError) throw productsError;
    products.push(...page);
    if (page.length < PAGE_SIZE) break;
    console.warn(
      "Products page returned full page size; fetching next page to avoid truncation."
    );
    productStart += PAGE_SIZE;
  }

  console.log(`✓ Fetched ${products.length} products`);

  // Fetch all variants with size and color information (paginated)
  console.log("Fetching product variants...");

  const variantSelect = `
      id,
      product_id,
      size_slug,
      color_id,
      stock_quantity,
      sizes (
        slug,
        name,
        display_order
      ),
      colors (
        id,
        name,
        hex_code
      )
    `;

  const variants = [];
  let variantStart = 0;
  while (true) {
    const variantEnd = variantStart + PAGE_SIZE - 1;
    const { data: page, error: variantsError } = await supabase
      .from("product_variants")
      .select(variantSelect)
      .order("product_id", { ascending: true })
      .range(variantStart, variantEnd);

    if (variantsError) throw variantsError;
    variants.push(...page);
    if (page.length < PAGE_SIZE) break;
    console.warn(
      "Variants page returned full page size; fetching next page to avoid truncation."
    );
    variantStart += PAGE_SIZE;
  }

  console.log(`✓ Fetched ${variants.length} variants`);

  // Group variants by product_id
  const variantsByProduct = new Map();
  for (const variant of variants) {
    if (!variantsByProduct.has(variant.product_id)) {
      variantsByProduct.set(variant.product_id, []);
    }
    variantsByProduct.get(variant.product_id).push(variant);
  }

  return { products, variantsByProduct };
}

function createDenormalizedCsvData(products, variantsByProduct) {
  const rows = [];

  for (const product of products) {
    const categoryId = product.categories?.id || "";
    const categoryName = product.categories?.name || "";
    const categorySlug = product.categories?.slug || "";
    const images = parseImages(product.images);
    const imageUrls = images.join(" | ");
    const imageCount = images.length;
    
    // Get variants for this product
    const productVariants = variantsByProduct.get(product.id) || [];
    const totalVariantStock = productVariants.reduce(
      (sum, v) => sum + (v.stock_quantity || 0),
      0
    );
    const totalStock = product.stock_quantity || 0;
    const inventoryValue = (product.price || 0) * totalStock;

    // Determine stock status
    let stockStatus = "Out of Stock";
    if (totalStock > 5) {
      stockStatus = "In Stock";
    } else if (totalStock > 0) {
      stockStatus = "Low Stock";
    }

    if (productVariants.length === 0) {
      // Product with no variants - single row
      rows.push({
        product_id: product.id,
        product_name: product.name,
        product_description: product.description || "",
        product_price: product.price,
        product_slug: product.slug,
        category_id: categoryId,
        category_name: categoryName,
        category_slug: categorySlug,
        is_featured: product.is_featured ? "Yes" : "No",
        product_stock_quantity: totalStock,
        variant_id: "",
        variant_size: "One Size",
        variant_size_order: 0,
        variant_color: "",
        variant_color_hex: "",
        variant_stock_quantity: "",
        total_variant_count: 0,
        total_variant_stock: 0,
        stock_status: stockStatus,
        inventory_value: inventoryValue.toFixed(2),
        image_urls: imageUrls,
        image_count: imageCount,
        created_at: formatDate(product.created_at),
        updated_at: formatDate(product.updated_at),
      });
    } else {
      // Product with variants - one row per variant
      for (const variant of productVariants) {
        const variantStock = variant.stock_quantity || 0;
        let variantStockStatus = "Out of Stock";
        if (variantStock > 5) {
          variantStockStatus = "In Stock";
        } else if (variantStock > 0) {
          variantStockStatus = "Low Stock";
        }

        rows.push({
          product_id: product.id,
          product_name: product.name,
          product_description: product.description || "",
          product_price: product.price,
          product_slug: product.slug,
          category_id: categoryId,
          category_name: categoryName,
          category_slug: categorySlug,
          is_featured: product.is_featured ? "Yes" : "No",
          product_stock_quantity: totalStock,
          variant_id: variant.id,
          variant_size: variant.sizes?.name || "One Size",
          variant_size_order: variant.sizes?.display_order || 0,
          variant_color: variant.colors?.name || "",
          variant_color_hex: variant.colors?.hex_code || "",
          variant_stock_quantity: variantStock,
          total_variant_count: productVariants.length,
          total_variant_stock: totalVariantStock,
          stock_status: variantStockStatus,
          inventory_value: ((product.price || 0) * variantStock).toFixed(2),
          image_urls: imageUrls,
          image_count: imageCount,
          created_at: formatDate(product.created_at),
          updated_at: formatDate(product.updated_at),
        });
      }
    }
  }

  return rows;
}

function generateCsvContent(rows) {
  if (rows.length === 0) {
    return "";
  }

  // Get headers from first row
  const headers = Object.keys(rows[0]);
  
  // Create CSV content
  const lines = [];
  
  // Add header row
  lines.push(headers.map(h => escapeCsvValue(h)).join(","));
  
  // Add data rows
  for (const row of rows) {
    const values = headers.map(header => escapeCsvValue(row[header]));
    lines.push(values.join(","));
  }
  
  return lines.join("\n");
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").split("T")[0];
  const defaultOutputPath = resolve(
    process.cwd(),
    `exports/product-catalog-${timestamp}.csv`
  );
  
  const outputPath = process.argv[2]
    ? resolve(process.cwd(), process.argv[2])
    : defaultOutputPath;

  // Ensure the parent directory of outputPath exists
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  console.log("\n📊 Product Catalog CSV Export Tool\n");
  console.log("═".repeat(60));

  // Fetch data
  const { products, variantsByProduct } = await fetchProductCatalog();

  // Create denormalized data
  console.log("\nGenerating denormalized CSV data...");
  const csvData = createDenormalizedCsvData(products, variantsByProduct);
  console.log(`✓ Created ${csvData.length} rows`);

  // Generate CSV content
  console.log("Converting to CSV format...");
  const csvContent = generateCsvContent(csvData);

  // Write file
  console.log("Writing CSV file...");
  writeFileSync(outputPath, csvContent, "utf-8");

  // Calculate some stats
  const totalStock = csvData.reduce((sum, row) => {
    const variantStockStr = String(row.variant_stock_quantity ?? '').trim();
    const productStockStr = String(row.product_stock_quantity ?? '').trim();
    let stockValue = 0;
    if (variantStockStr !== '') {
      const variantNum = Number(variantStockStr);
      if (Number.isFinite(variantNum)) stockValue = variantNum;
    }
    if (stockValue === 0 && productStockStr !== '') {
      const productNum = Number(productStockStr);
      if (Number.isFinite(productNum)) stockValue = productNum;
    }
    return sum + stockValue;
  }, 0);
  const totalValue = csvData.reduce((sum, row) => sum + Number(row.inventory_value), 0);
  const uniqueProducts = new Set(csvData.map(row => row.product_id)).size;

  console.log("\n" + "═".repeat(60));
  console.log("✅ Export complete!");
  console.log("═".repeat(60));
  console.log(`\nOutput file: ${outputPath}`);
  console.log(`\nStatistics:`);
  console.log(`  Total Rows:           ${csvData.length}`);
  console.log(`  Unique Products:      ${uniqueProducts}`);
  console.log(`  Total Stock Units:    ${totalStock}`);
  console.log(`  Total Value:          ₹${totalValue.toFixed(2)}`);
  
  if (csvData.length > 0) {
    console.log(`\nColumns (${Object.keys(csvData[0]).length}):`);
    Object.keys(csvData[0]).forEach((col, i) => {
      console.log(`  ${(i + 1).toString().padStart(2)}. ${col}`);
    });
  } else {
    console.log(`\n⚠️  No products found. CSV file is empty.`);
  }
  console.log();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
