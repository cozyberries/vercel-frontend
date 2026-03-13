#!/usr/bin/env node

/**
 * Merge jabla-and-shorts storage folders into standard names: jhabla-shorts-half-sleeve-<design>.
 * Moves all files from source folders into the target folder (same filename; skip if target exists).
 *
 * Mappings (source → target):
 *   jhabla-half-sleeve-moons-and-stars  → jhabla-shorts-half-sleeve-moons-and-stars
 *   jhabla-half-sleeve-popsicles        → jhabla-shorts-half-sleeve-popsicles
 *   jhabla-shorts-moons-and-stars       → jhabla-shorts-half-sleeve-moons-and-stars
 *   jhabla-shorts-popsicles             → jhabla-shorts-half-sleeve-popsicles
 *
 * Run the DB migration first so product_images and products use the standard slugs.
 *
 * Usage:
 *   node scripts/merge-jhabla-shorts-folders.mjs [--dry-run]
 */

import { createClient } from "@supabase/supabase-js";
import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const dryRun = process.argv.includes("--dry-run");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const BUCKET = "media";

const MERGE_MAP = [
  { from: "jhabla-half-sleeve-moons-and-stars", to: "jhabla-shorts-half-sleeve-moons-and-stars" },
  { from: "jhabla-half-sleeve-popsicles", to: "jhabla-shorts-half-sleeve-popsicles" },
  { from: "jhabla-shorts-moons-and-stars", to: "jhabla-shorts-half-sleeve-moons-and-stars" },
  { from: "jhabla-shorts-popsicles", to: "jhabla-shorts-half-sleeve-popsicles" },
];

async function listFolder(path) {
  const { data, error } = await supabase.storage.from(BUCKET).list(path, { limit: 1000 });
  if (error) throw new Error(`List ${path}: ${error.message}`);
  return data ?? [];
}

/** Recursively collect all object paths under products/<slug>/ (relative to products/). */
async function listAllObjectPaths(productsPrefix, slug) {
  const prefix = `${productsPrefix}/${slug}`;
  const paths = [];
  const stack = [""];
  while (stack.length) {
    const rel = stack.pop();
    const fullPath = rel ? `${prefix}/${rel}` : `${prefix}`;
    const entries = await listFolder(fullPath);
    for (const e of entries) {
      const name = e.name;
      if (!name || name.startsWith(".")) continue;
      const relPath = rel ? `${rel}/${name}` : name;
      if (e.id) {
        paths.push(relPath);
      } else {
        stack.push(relPath);
      }
    }
  }
  return paths;
}

async function moveFile(fromPath, toPath) {
  const { error } = await supabase.storage.from(BUCKET).move(fromPath, toPath);
  if (error) throw new Error(`Move failed: ${error.message}`);
}

async function run() {
  console.log(dryRun ? "DRY RUN — no changes will be made\n" : "");
  const productRoot = "products";
  let totalMoves = 0;
  let successCount = 0;
  let errorCount = 0;
  let skipCount = 0;

  for (const { from: fromSlug, to: toSlug } of MERGE_MAP) {
    const fromPrefix = `${productRoot}/${fromSlug}`;
    const toPrefix = `${productRoot}/${toSlug}`;
    let files;
    try {
      files = await listAllObjectPaths(productRoot, fromSlug);
    } catch (err) {
      if (err.message.includes("not found") || err.message.includes("Listing")) {
        console.log(`  Skip ${fromSlug} (folder missing or empty)\n`);
        continue;
      }
      throw err;
    }
    if (files.length === 0) {
      console.log(`  ${fromSlug} → ${toSlug}: no files\n`);
      continue;
    }
    console.log(`  ${fromSlug} → ${toSlug} (${files.length} file(s))`);
    for (const rel of files) {
      const fromPath = `${fromPrefix}/${rel}`;
      const toPath = `${toPrefix}/${rel}`;
      totalMoves++;
      if (dryRun) {
        console.log(`    [dry-run] ${fromPath} → ${toPath}`);
        successCount++;
        continue;
      }
      try {
        await moveFile(fromPath, toPath);
        console.log(`    ✓ ${rel}`);
        successCount++;
      } catch (err) {
        if (err.message.includes("already exists") || err.message.includes("duplicate")) {
          skipCount++;
          console.log(`    skip ${rel} (exists)`);
        } else {
          console.error(`    ✗ ${rel}: ${err.message}`);
          errorCount++;
        }
      }
    }
    console.log("");
  }

  console.log("─".repeat(50));
  console.log(`Total: ${totalMoves} move(s) planned`);
  if (dryRun) {
    console.log(`Dry run complete — ${successCount} move(s) would be made`);
  } else {
    console.log(`Done: ${successCount} moved, ${skipCount} skipped (exists), ${errorCount} failed`);
  }
}

run().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
