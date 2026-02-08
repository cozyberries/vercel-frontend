#!/usr/bin/env node

/**
 * One-time: restore original category slugs (names were renamed; slugs must stay for URLs).
 * Original slugs in id order (before the mistaken update) for the first 8 categories.
 *
 * Usage: node scripts/restore-category-slugs.mjs [--dry-run]
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

const ORIGINAL_SLUGS_BY_POSITION = [
  "pyjamas",
  "frock",
  "jhabla-shorts",
  "rompers-girls-only",
  "jhabla",
  "rompers-unisex",
  "coords-set",
  "new-born-essential-kits",
];

const DRY_RUN = process.argv.includes("--dry-run");

async function run() {
  const { data: categories, error } = await supabase
    .from("categories")
    .select("id, name, slug")
    .order("id", { ascending: true });

  if (error) {
    console.error("❌ Failed to fetch categories:", error.message);
    process.exit(1);
  }

  // Build name → target slug map (same id order as ORIGINAL_SLUGS_BY_POSITION)
  const nameToOriginalSlug = {};
  for (let i = 0; i < ORIGINAL_SLUGS_BY_POSITION.length && i < (categories?.length ?? 0); i++) {
    nameToOriginalSlug[categories[i].name] = ORIGINAL_SLUGS_BY_POSITION[i];
  }

  const toRestore = [];
  for (const cat of categories ?? []) {
    const restoreSlug = nameToOriginalSlug[cat.name];
    if (restoreSlug === undefined) {
      console.log(`  [skip] No target slug for category: ${cat.name} (id: ${cat.id})`);
      continue;
    }
    if (cat.slug !== restoreSlug) {
      toRestore.push({
        id: cat.id,
        name: cat.name,
        currentSlug: cat.slug,
        restoreSlug,
        originalSlug: cat.slug,
      });
    }
  }

  if (toRestore.length === 0) {
    console.log("✅ All slugs already match originals. Nothing to restore.");
    return;
  }

  console.log(`Restore ${toRestore.length} slug(s):`);
  toRestore.forEach((r) => console.log(`  ${r.name}: ${r.currentSlug} → ${r.restoreSlug}`));
  if (DRY_RUN) {
    console.log("\n[DRY RUN] No changes made.");
    return;
  }

  // Two-phase to avoid unique constraint: first set all to temp slugs, then to target
  const successfullyTemporarilyUpdated = [];
  for (const r of toRestore) {
    const id = r.id != null ? String(r.id) : "";
    if (!id) {
      console.error(`  ❌ Skipping ${r.name}: missing id`);
      continue;
    }
    const tempSlug = `_restore_${id.slice(0, 8)}`;
    const { error: e1 } = await supabase.from("categories").update({ slug: tempSlug }).eq("id", r.id);
    if (e1) {
      console.error(`  ❌ temp ${r.name}:`, e1.message);
      continue;
    }
    successfullyTemporarilyUpdated.push({ ...r, tempSlug });
  }
  for (const r of successfullyTemporarilyUpdated) {
    const { error: e2 } = await supabase.from("categories").update({ slug: r.restoreSlug }).eq("id", r.id);
    if (e2) {
      console.error(`  ❌ ${r.name} → ${r.restoreSlug}:`, e2.message);
      // Rollback to original slug so row is left in consistent state (not temp slug)
      const { error: e3 } = await supabase.from("categories").update({ slug: r.originalSlug }).eq("id", r.id);
      if (e3) {
        console.error(`  ❌ Rollback failed for ${r.name}:`, e3.message);
      }
    } else {
      console.log(`  ✓ ${r.name} → ${r.restoreSlug}`);
    }
  }
  console.log("\n✅ Slug restore done.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
