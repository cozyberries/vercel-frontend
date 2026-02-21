#!/usr/bin/env node

/**
 * Rename category names in Product Catalogue CSV to match DB category names.
 * Fetches categories from Supabase and maps CSV category names (by name or slug)
 * to DB names, then rewrites the CSV.
 *
 * Usage:
 *   node scripts/rename-catalogue-categories-to-db.mjs [csv-path]
 *
 * Default csv-path: public/Product Catalogue.csv
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
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
const DEFAULT_CSV_PATH = resolve(process.cwd(), "public/Product Catalogue.csv");

function escapeCsvField(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main() {
  const csvPath = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : DEFAULT_CSV_PATH;
  if (!existsSync(csvPath)) {
    console.error(`❌ File not found: ${csvPath}`);
    process.exit(1);
  }

  const [categoriesRes, productsRes] = await Promise.all([
    supabase.from("categories").select("id, name, slug"),
    supabase.from("products").select("id, category_id"),
  ]);

  if (categoriesRes.error) {
    console.error("❌ Failed to fetch categories:", categoriesRes.error.message);
    process.exit(1);
  }
  if (productsRes.error) {
    console.error("❌ Failed to fetch products:", productsRes.error.message);
    process.exit(1);
  }

  const categories = categoriesRes.data || [];
  const products = productsRes.data || [];
  const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const productById = Object.fromEntries(products.map((p) => [p.id, p]));
  const categoryBySlug = Object.fromEntries(
    categories.map((c) => [c.slug?.toLowerCase(), c])
  );
  const categoryByName = Object.fromEntries(
    categories.map((c) => [c.name?.toLowerCase().trim(), c])
  );

  function csvCategoryToDbNameByNameOrSlug(csvName) {
    if (!csvName || typeof csvName !== "string") return null;
    const trimmed = csvName.trim();
    const byName = categoryByName[trimmed.toLowerCase()];
    if (byName) return byName.name;
    const slug = slugify(trimmed);
    const bySlug = categoryBySlug[slug?.toLowerCase()];
    return bySlug ? bySlug.name : null;
  }

  const raw = readFileSync(csvPath, "utf-8");
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  // Build csvCategory -> [product_ids] from CSV
  const csvCategoryToProductIds = new Map();
  for (const row of records) {
    const cat = (row["Category"] ?? "").trim();
    const pid = (row["Product id"] ?? "").trim().replace(/^\//, "");
    if (!cat || !pid) continue;
    if (!csvCategoryToProductIds.has(cat)) csvCategoryToProductIds.set(cat, []);
    if (!csvCategoryToProductIds.get(cat).includes(pid)) {
      csvCategoryToProductIds.get(cat).push(pid);
    }
  }

  const csvCategoryToDb = new Map();
  for (const [csvCat, pids] of csvCategoryToProductIds) {
    let dbName = csvCategoryToDbNameByNameOrSlug(csvCat);
    if (!dbName) {
      for (const pid of pids) {
        const p = productById[pid];
        if (p?.category_id) {
          const cat = categoryById[p.category_id];
          if (cat) {
            dbName = cat.name;
            break;
          }
        }
      }
    }
    csvCategoryToDb.set(csvCat, dbName || csvCat);
  }

  console.log("Category renames (CSV → DB):");
  for (const [csvName, dbName] of csvCategoryToDb) {
    console.log(`  "${csvName}" → "${dbName}"`);
  }

  const columns = ["Product id", "Product Title", "Category", "Available Size", "Price"];
  const outRows = records.map((row) => {
    const cat = (row["Category"] ?? "").trim();
    return {
      ...row,
      Category: csvCategoryToDb.get(cat) ?? cat,
    };
  });

  const header = columns.join(",");
  const body = outRows
    .map((row) => columns.map((col) => escapeCsvField(row[col])).join(","))
    .join("\n");
  const output = header + "\n" + body + "\n";

  writeFileSync(csvPath, output, "utf-8");
  console.log(`\n✓ Updated ${csvPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
