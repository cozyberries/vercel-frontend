#!/usr/bin/env node

/**
 * Apply the sizes table migration: slug as primary key, remove id and age_slug.
 *
 * Requires: DATABASE_URL (Supabase Project Settings → Database → Connection string)
 * Or run the SQL manually in Supabase SQL Editor:
 *   supabase/migrations/20250221000000_sizes_slug_primary_key.sql
 *
 * Usage: node scripts/run-sizes-migration.mjs
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

function getDatabaseUrl() {
  if (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.SUPABASE_DIRECT_URL) {
    return process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.SUPABASE_DIRECT_URL;
  }
  // Build from Supabase project URL + DB password (Project Settings → Database → Connection string)
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_DATABASE_PASSWORD;
  if (supabaseUrl && dbPassword) {
    const match = supabaseUrl.match(/https:\/\/([^.]+)/);
    const projectRef = match ? match[1] : null;
    if (projectRef) {
      return `postgresql://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;
    }
  }
  return null;
}

const DATABASE_URL = getDatabaseUrl();

const migrationPath = resolve(
  root,
  "supabase/migrations/20250221000000_sizes_slug_primary_key.sql"
);

/** Split SQL into statements (by semicolon at line end or end of string), strip comment-only lines. */
function getStatements(sql) {
  const lines = sql.split("\n");
  const statements = [];
  let current = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("--")) continue;
    current.push(line);
    if (trimmed.endsWith(";")) {
      const stmt = current.join("\n").replace(/\s*;\s*$/, "").trim();
      if (stmt) statements.push(stmt);
      current = [];
    }
  }
  if (current.length) {
    const stmt = current.join("\n").trim();
    if (stmt) statements.push(stmt);
  }
  return statements;
}

async function main() {
  if (!DATABASE_URL) {
    console.error("❌ DATABASE_URL (or SUPABASE_DB_URL / SUPABASE_DIRECT_URL) is not set.");
    console.error("\nTo apply the migration:");
    console.error("  1. Set DATABASE_URL in .env to your Supabase connection string");
    console.error("     (Project Settings → Database → Connection string)");
    console.error("  2. Run: node scripts/run-sizes-migration.mjs");
    console.error("\nOr run the SQL manually in Supabase SQL Editor:");
    console.error("  " + migrationPath);
    process.exit(1);
  }

  if (!existsSync(migrationPath)) {
    console.error("❌ Migration file not found: " + migrationPath);
    process.exit(1);
  }

  const sql = readFileSync(migrationPath, "utf-8");
  const statements = getStatements(sql);

  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    for (let i = 0; i < statements.length; i++) {
      await client.query(statements[i]);
      console.log("  ✓ " + (i + 1) + "/" + statements.length);
    }
    console.log("\n✓ Sizes migration applied successfully.");
  } catch (err) {
    console.error("\n❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
