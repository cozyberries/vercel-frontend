#!/usr/bin/env node

/**
 * Rename size tokens in Product Catalogue CSV "Available Size" column to DB size names.
 * Fetches sizes from Supabase and maps CSV tokens (e.g. "6-12", "1-2") to DB names (e.g. "6-12M", "1-2Y").
 *
 * Usage:
 *   node scripts/rename-catalogue-sizes-to-db.mjs [csv-path]
 *
 * Default csv-path: public/Product Catalogue.csv
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { parse } from "csv-parse/sync";

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

/**
 * Parse "Available Size" string into list of size tokens.
 * e.g. "(6-12), (1-2), (2-3)" -> ["6-12", "1-2", "2-3"]
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
 * Format size names back to CSV style: "(name1), (name2), (name3)"
 */
function formatAvailableSizes(names) {
  if (!names.length) return "";
  return names.map((n) => `(${n})`).join(", ");
}

async function main() {
  const csvPath = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : DEFAULT_CSV_PATH;
  if (!existsSync(csvPath)) {
    console.error(`❌ File not found: ${csvPath}`);
    process.exit(1);
  }

  const { data: sizes, error } = await supabase
    .from("sizes")
    .select("slug, name")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("❌ Failed to fetch sizes:", error.message);
    process.exit(1);
  }

  // Build token -> DB name: DB names are like "0-3M", "6-12M", "1-2Y". Token = name without trailing M/Y.
  const tokenToDbName = new Map();
  for (const s of sizes || []) {
    const name = (s.name || "").trim();
    if (!name) continue;
    const token = name.replace(/[MY]$/i, "").trim();
    if (token) tokenToDbName.set(token, name);
    tokenToDbName.set(name, name);
  }

  console.log("Size token → DB name:");
  for (const [token, dbName] of [...tokenToDbName.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (token !== dbName) console.log(`  "${token}" → "${dbName}"`);
  }

  const raw = readFileSync(csvPath, "utf-8");
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  const columns = ["Product id", "Product Title", "Category", "Available Size", "Price"];
  const outRows = records.map((row) => {
    const availableSize = (row["Available Size"] ?? "").trim();
    const tokens = parseAvailableSizes(availableSize);
    const dbNames = tokens.map((t) => tokenToDbName.get(t) || t);
    return {
      ...row,
      "Available Size": formatAvailableSizes(dbNames),
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
