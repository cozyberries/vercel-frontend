#!/usr/bin/env node

/**
 * Update category display names (name only; slugs are never changed) in Supabase from product-categories.txt
 *
 * Reads product-categories.txt (one category name per line), fetches categories
 * from the DB ordered by id, and updates each category in order: line 1 → first
 * category, line 2 → second, etc. Only the name column is updated; slug is left unchanged.
 * New categories (when file has more lines than DB) are inserted with slug = slugify(name).
 *
 * Usage:
 *   node scripts/update-categories-from-file.mjs [file-path] [options]
 *
 * Arguments:
 *   file-path    Optional path to categories file (default: product-categories.txt)
 *
 * Options:
 *   --dry-run    Print what would be updated without actually updating
 *
 * Requires: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
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

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const DRY_RUN = process.argv.includes("--dry-run");
const FILE_PATH = resolve(
  process.cwd(),
  args[0] || "product-categories.txt"
);

async function run() {
  let fileContent;
  try {
    fileContent = readFileSync(FILE_PATH, "utf8");
  } catch (err) {
    console.error(`❌ Could not read ${FILE_PATH}:`, err.message);
    process.exit(1);
  }

  const namesFromFile = fileContent
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (namesFromFile.length === 0) {
    console.error("❌ No category names found in file (empty or whitespace-only lines).");
    process.exit(1);
  }

  console.log(`📄 Read ${namesFromFile.length} category names from ${FILE_PATH}`);
  if (DRY_RUN) console.log("   (dry run – no changes will be written)\n");

  const { data: categories, error: fetchError } = await supabase
    .from("categories")
    .select("id, name, slug")
    .order("id", { ascending: true });

  if (fetchError) {
    console.error("❌ Failed to fetch categories:", fetchError.message);
    process.exit(1);
  }

  if (!categories?.length) {
    console.error("❌ No categories found in database.");
    process.exit(1);
  }

  const toUpdate = [];
  const toInsert = [];
  for (let i = 0; i < namesFromFile.length; i++) {
    const newName = namesFromFile[i];
    if (i < categories.length) {
      const cat = categories[i];
      if (cat.name !== newName) {
        toUpdate.push({
          id: cat.id,
          oldName: cat.name,
          slug: cat.slug,
          name: newName,
        });
      }
    } else {
      toInsert.push({ name: newName, slug: slugify(newName) });
    }
  }

  if (toUpdate.length === 0 && toInsert.length === 0) {
    console.log("✅ Categories already match the file. Nothing to update.");
    if (categories.length > namesFromFile.length) {
      console.log(
        `   (DB has ${categories.length - namesFromFile.length} extra categor${categories.length - namesFromFile.length === 1 ? "y" : "ies"} that will be left unchanged.)`
      );
    }
    return;
  }

  if (toUpdate.length) {
    console.log(`\nUpdates to apply (name only; slug unchanged) (${toUpdate.length}):`);
    toUpdate.forEach((u) => {
      console.log(`  ${u.oldName} → ${u.name}  (slug stays: ${u.slug})`);
    });
  }
  if (toInsert.length) {
    console.log(`\nNew categories to insert (${toInsert.length}):`);
    toInsert.forEach(({ name, slug }) => console.log(`  + ${name} (${slug})`));
  }
  if (categories.length > namesFromFile.length) {
    console.log(
      `\n⚠️  DB has ${categories.length - namesFromFile.length} more category/categories; they will be left unchanged.`
    );
  }

  if (DRY_RUN) {
    console.log("\n[DRY RUN] No updates performed.");
    return;
  }

  const readline = await import("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.question(
      `Apply ${toUpdate.length} update(s) and ${toInsert.length} insert(s) to categories? [y/N] `,
      (ans) => {
        rl.close();
        resolve((ans || "").trim().toLowerCase());
      }
    );
  });
  if (answer !== "y" && answer !== "yes") {
    console.log("Aborted. No changes made.");
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const u of toUpdate) {
    const { error } = await supabase
      .from("categories")
      .update({ name: u.name })
      .eq("id", u.id);
    if (error) {
      console.error(`  ❌ ${u.oldName} → ${u.name}:`, error.message);
      fail++;
    } else {
      console.log(`  ✓ Updated name: ${u.name} (slug: ${u.slug})`);
      ok++;
    }
  }
  for (const { name, slug } of toInsert) {
    const { error } = await supabase.from("categories").insert({
      name,
      slug,
      display: true,
    });
    if (error) {
      console.error(`  ❌ Insert ${name}:`, error.message);
      fail++;
    } else {
      console.log(`  ✓ Inserted: ${name} (${slug})`);
      ok++;
    }
  }

  const updatedLabel = toUpdate.length ? `Updated ${toUpdate.length}.` : "";
  const insertedLabel = toInsert.length ? `Inserted ${toInsert.length}.` : "";
  console.log(`\n✅ Done. ${updatedLabel} ${insertedLabel}${fail ? ` ${fail} failed.` : ""}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
