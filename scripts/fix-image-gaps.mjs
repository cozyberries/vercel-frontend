#!/usr/bin/env node

/**
 * Renames product images in Supabase storage to fill sequence gaps,
 * then updates matching URLs in the product_images DB table.
 *
 * Example: files 1.jpg, 2.jpg, 4.jpg → renamed to 1.jpg, 2.jpg, 3.jpg
 *
 * Usage:
 *   node scripts/fix-image-gaps.mjs [--dry-run]
 *
 * Options:
 *   --dry-run   Log planned renames only; no storage moves or DB updates.
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

// Each entry: product slug → renames sorted ASCENDING (lowest source first).
// For downward renames (from > to), ascending order ensures the destination slot
// is always free before the move (each step frees a slot for the next step).
//
// Products that partially succeeded in a previous run are listed with only their
// REMAINING renames (already-done moves are omitted to avoid "already exists" errors).
const RENAME_PLAN = [
  // ── Already fully fixed (coords-set-rocket-rangers, jhabla-shorts-half-sleeve-mushie-mini,
  //    jhabla-shorts-sleeveless-moons-and-stars, all four jhabla-sleeveless-*) ──
  // Those are done. Only the 10 failed products remain below.

  // Partial: 8→6 already done; files now 1,2,3,5,6,7 → need 5→4 then 7→5
  {
    slug: "jhabla-shorts-half-sleeve-joyful-orbs",
    renames: [{ from: 5, to: 4 }, { from: 7, to: 5 }],
  },
  // Full fail: files still 1,2,3,5,6,7,8 → ascending order
  {
    slug: "pyjamas-classic-popsicles",
    renames: [{ from: 5, to: 4 }, { from: 6, to: 5 }, { from: 7, to: 6 }, { from: 8, to: 7 }],
  },
  // Partial: 8→6 already done; files now 1,2,3,5,6,7 → need 5→4 then 7→5
  {
    slug: "pyjamas-classic-joyful-orbs",
    renames: [{ from: 5, to: 4 }, { from: 7, to: 5 }],
  },
  {
    slug: "pyjamas-classic-moons-and-stars",
    renames: [{ from: 5, to: 4 }, { from: 7, to: 5 }],
  },
  {
    slug: "pyjamas-classic-pine-cone",
    renames: [{ from: 5, to: 4 }, { from: 7, to: 5 }],
  },
  // Partial: 8→6 already done; files now 1,2,3,5,6,7 → need 5→4 then 7→5
  {
    slug: "pyjamas-ribbed-joyful-orbs",
    renames: [{ from: 5, to: 4 }, { from: 7, to: 5 }],
  },
  // Full fail: files still 1,2,3,4,6,7 → ascending order
  {
    slug: "pyjamas-ribbed-moons-and-stars",
    renames: [{ from: 6, to: 5 }, { from: 7, to: 6 }],
  },
  // Full fail: files still 1,2,3,5,6,7,8 → ascending order
  {
    slug: "pyjamas-ribbed-mushie-mini",
    renames: [{ from: 5, to: 4 }, { from: 6, to: 5 }, { from: 7, to: 6 }, { from: 8, to: 7 }],
  },
  // Full fail: files still 1,2,3,4,5,7,8 → ascending order
  {
    slug: "pyjamas-ribbed-pine-cone",
    renames: [{ from: 7, to: 6 }, { from: 8, to: 7 }],
  },
  // Full fail: files still 1,2,3,5,6,7 → ascending order
  {
    slug: "pyjamas-ribbed-popsicles",
    renames: [{ from: 5, to: 4 }, { from: 6, to: 5 }, { from: 7, to: 6 }],
  },
];

function storagePath(slug, n) {
  return `products/${slug}/${n}.jpg`;
}

function publicUrl(slug, n) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/products/${slug}/${n}.jpg`;
}

async function moveFile(fromPath, toPath) {
  const { error } = await supabase.storage.from(BUCKET).move(fromPath, toPath);
  if (error) throw new Error(`Storage move failed: ${error.message}`);
}

async function updateDbUrl(oldUrl, newUrl) {
  const { error } = await supabase
    .from("product_images")
    .update({ url: newUrl })
    .eq("url", oldUrl);
  if (error) throw new Error(`DB update failed: ${error.message}`);
}

async function run() {
  console.log(dryRun ? "DRY RUN — no changes will be made\n" : "");

  let totalMoves = 0;
  let successCount = 0;
  let errorCount = 0;

  for (const { slug, renames } of RENAME_PLAN) {
    console.log(`\n── ${slug}`);

    let productOk = true;
    for (const { from, to } of renames) {
      totalMoves++;
      const fromPath = storagePath(slug, from);
      const toPath = storagePath(slug, to);
      const oldUrl = publicUrl(slug, from);
      const newUrl = publicUrl(slug, to);

      console.log(`   ${from}.jpg → ${to}.jpg`);

      if (dryRun) {
        console.log(`     storage: move ${fromPath} → ${toPath}`);
        console.log(`     db:      ${oldUrl} → ${newUrl}`);
        successCount++;
        continue;
      }

      try {
        await moveFile(fromPath, toPath);
        await updateDbUrl(oldUrl, newUrl);
        console.log(`     ✓`);
        successCount++;
      } catch (err) {
        console.error(`     ✗ ${err.message}`);
        errorCount++;
        productOk = false;
        break; // abort remaining renames for this product on error
      }
    }

    if (!productOk) {
      console.warn(`   ⚠ Stopped early due to error — check ${slug} manually`);
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`Total: ${totalMoves} moves planned`);
  console.log(dryRun
    ? `Dry run complete — ${successCount} moves would be made`
    : `Done: ${successCount} succeeded, ${errorCount} failed`
  );
}

run().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
