#!/usr/bin/env node

/**
 * Rename all product storage folders from "Raw" to "raw".
 * Moves every object under products/<slug>/Raw/ to products/<slug>/raw/.
 *
 * Usage:
 *   node scripts/rename-raw-to-lowercase.mjs [--dry-run]
 *
 * Options:
 *   --dry-run   Log planned moves only; no storage changes.
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

async function listFolder(path) {
  const { data, error } = await supabase.storage.from(BUCKET).list(path, { limit: 1000 });
  if (error) throw new Error(`List ${path}: ${error.message}`);
  return data ?? [];
}

async function moveFile(fromPath, toPath) {
  const { error } = await supabase.storage.from(BUCKET).move(fromPath, toPath);
  if (error) throw new Error(`Move failed: ${error.message}`);
}

async function run() {
  console.log(dryRun ? "DRY RUN — no changes will be made\n" : "");

  const productRoot = "products";
  const productDirs = await listFolder(productRoot);
  let totalMoves = 0;
  let successCount = 0;
  let errorCount = 0;

  for (const entry of productDirs) {
    if (!entry.name || entry.name.startsWith(".")) continue;
    const slug = entry.name;
    const slugPath = `${productRoot}/${slug}`;
    const children = await listFolder(slugPath);

    const rawFolder = children.find((c) => c.name === "Raw");
    if (!rawFolder) continue;

    const rawPath = `${slugPath}/Raw`;
    const files = await listFolder(rawPath);

    if (files.length === 0) {
      console.log(`  ${slug}/Raw: empty, skipping (no files to move)\n`);
      continue;
    }

    console.log(`  ${slug}/Raw → raw (${files.length} file(s))`);

    for (const file of files) {
      const fromPath = `${rawPath}/${file.name}`;
      const toPath = `${slugPath}/raw/${file.name}`;
      totalMoves++;

      if (dryRun) {
        console.log(`    [dry-run] ${fromPath} → ${toPath}`);
        successCount++;
        continue;
      }

      try {
        await moveFile(fromPath, toPath);
        console.log(`    ✓ ${file.name}`);
        successCount++;
      } catch (err) {
        console.error(`    ✗ ${file.name}: ${err.message}`);
        errorCount++;
      }
    }
    console.log("");
  }

  console.log("─".repeat(50));
  console.log(`Total: ${totalMoves} move(s) planned`);
  console.log(
    dryRun
      ? `Dry run complete — ${successCount} move(s) would be made`
      : `Done: ${successCount} succeeded, ${errorCount} failed`
  );
}

run().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
