#!/usr/bin/env node

/**
 * Rename category image files to slug-based names.
 * Uses category-mapping.json: for each slug, renames files to <slug>.png, <slug>-2.png, ...
 *
 * Usage: node scripts/rename-category-images-to-slugs.mjs [--dry-run]
 */

import { readFileSync, readdirSync, existsSync, renameSync } from "fs";
import { join, resolve } from "path";

const CATEGORIES_DIR = resolve(process.cwd(), "../Product Catalogue/Categories");
const MAPPING_FILE = join(CATEGORIES_DIR, "category-mapping.json");
const dryRun = process.argv.includes("--dry-run");

if (!existsSync(CATEGORIES_DIR)) {
  console.error("Categories dir not found:", CATEGORIES_DIR);
  process.exit(1);
}

if (!existsSync(MAPPING_FILE)) {
  console.error("Mapping not found:", MAPPING_FILE);
  process.exit(1);
}

const mapping = JSON.parse(readFileSync(MAPPING_FILE, "utf-8"));
const existing = new Set(readdirSync(CATEGORIES_DIR));

for (const [slug, filenames] of Object.entries(mapping)) {
  if (!Array.isArray(filenames) || filenames.length === 0) continue;

  const ext = (name) => (name.match(/\.[^.]+$/)?.[0] ?? ".png");
  filenames.forEach((oldName, i) => {
    if (!existing.has(oldName)) return;
    const suffix = i === 0 ? "" : `-${i + 1}`;
    const newName = `${slug}${suffix}${ext(oldName)}`;
    if (oldName === newName) return;
    const from = join(CATEGORIES_DIR, oldName);
    const to = join(CATEGORIES_DIR, newName);
    if (dryRun) {
      console.log(`  ${oldName} → ${newName}`);
    } else {
      renameSync(from, to);
      console.log(`  ${oldName} → ${newName}`);
    }
  });
}

console.log(dryRun ? "\n[dry-run] Done." : "\nDone.");
