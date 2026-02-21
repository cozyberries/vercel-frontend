#!/usr/bin/env node

/**
 * Export product_variants where stock_quantity = 0 to CSV.
 *
 * Columns: product_id, name, size value, color value, stock_quantity
 *
 * Usage:
 *   node scripts/export-zero-stock-variants-csv.mjs [output-file]
 *
 * Arguments:
 *   output-file    Optional path for output CSV (default: public/zero-stock-variants.csv)
 *
 * Requires: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync } from "fs";

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

function escapeCsvValue(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function main() {
  const outPath =
    process.argv[2] || resolve(process.cwd(), "public/zero-stock-variants.csv");

  console.log("Fetching product_variants where stock_quantity = 0...");

  const { data, error } = await supabase
    .from("product_variants")
    .select(
      "product_id, stock_quantity, products(name), sizes(name), colors(name)"
    )
    .eq("stock_quantity", 0);

  if (error) {
    console.error("❌ Supabase error:", error.message);
    process.exit(1);
  }

  const rows = data || [];
  console.log(`Found ${rows.length} variant(s) with zero stock.`);

  const headers = [
    "product_id",
    "name",
    "size value",
    "color value",
    "stock_quantity",
  ];
  const lines = [headers.map(escapeCsvValue).join(",")];

  for (const row of rows) {
    const name = row.products?.name ?? "";
    const sizeValue = row.sizes?.name ?? "";
    const colorValue = row.colors?.name ?? "";
    lines.push(
      [
        escapeCsvValue(row.product_id),
        escapeCsvValue(name),
        escapeCsvValue(sizeValue),
        escapeCsvValue(colorValue),
        escapeCsvValue(row.stock_quantity ?? 0),
      ].join(",")
    );
  }

  const csvContent = lines.join("\n");
  writeFileSync(outPath, csvContent, "utf-8");
  console.log(`Wrote ${lines.length - 1} rows to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
