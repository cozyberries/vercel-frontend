#!/usr/bin/env node

/**
 * Rename colors in DB to match file values (Stock Summary "Prints (New)" / catalogue print names).
 * Updates the colors table so names align with the CSV; no mapping needed in update-stock-from-csv.
 *
 * Usage:
 *   node scripts/rename-db-colors-to-file.mjs [options]
 *
 * Options:
 *   --dry-run   Print renames without updating DB
 *
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
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

// Current DB color name → name to use (file / "Prints (New)" value)
const DB_COLOR_TO_FILE_NAME = {
  "Aloe Green": "Aloe Mist",
  "Pastel Pink": "Baby Blush",
  "Moons And Stars": "Moon and Stars",
  "Peach": "Soft Coral",
  "Rocket Rangers": "Rocket Ranger",
};

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== LIVE RUN ===");
  console.log();

  const { data: colors, error } = await supabase
    .from("colors")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    console.error("❌ Failed to fetch colors:", error.message);
    process.exit(1);
  }

  const toRename = (colors || []).filter((c) => DB_COLOR_TO_FILE_NAME[c.name] != null);

  if (toRename.length === 0) {
    console.log("No colors need renaming (DB names already match file or not in mapping).");
    return;
  }

  console.log(`Renaming ${toRename.length} color(s) in DB to match file values:\n`);
  for (const c of toRename) {
    const newName = DB_COLOR_TO_FILE_NAME[c.name];
    console.log(`  "${c.name}" → "${newName}" (id: ${c.id})`);
  }
  console.log();

  if (DRY_RUN) {
    console.log("DRY RUN — no changes written. Rerun without --dry-run to apply.\n");
    return;
  }

  let updated = 0;
  for (const c of toRename) {
    const newName = DB_COLOR_TO_FILE_NAME[c.name];
    const { error: upErr } = await supabase
      .from("colors")
      .update({ name: newName })
      .eq("id", c.id);
    if (upErr) {
      console.error(`❌ Failed to rename "${c.name}":`, upErr.message);
    } else {
      updated++;
    }
  }
  console.log(`✓ Renamed ${updated} color(s) in DB.\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
