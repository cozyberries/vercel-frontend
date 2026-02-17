#!/usr/bin/env node

/**
 * Fetch actual category image URLs from Cloudinary, update DB, and clear categories cache.
 * Uses public_id: cozyberries/categories/<slug>/1 (filename = 1).
 *
 * Usage:
 *   node scripts/update-category-image-urls-in-db.mjs [options]
 *   node scripts/update-category-image-urls-in-db.mjs --help
 *
 * Options:
 *   --dry-run   Log only; no DB updates or cache clear.
 *   --no-cache  Skip clearing categories cache after DB update.
 */

import { v2 as cloudinary } from "cloudinary";
import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

function parseArgs() {
  const args = process.argv.slice(2);
  let dryRun = false;
  let help = false;
  let noCache = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") dryRun = true;
    else if (args[i] === "--no-cache") noCache = true;
    else if (args[i] === "--help" || args[i] === "-h") help = true;
  }
  return { dryRun, help, noCache };
}

function showHelp() {
  console.log(`
Update category image URLs in DB from Cloudinary

  Fetches actual secure_url from Cloudinary (cozyberries/categories/<slug>/1),
  updates categories_images + categories.image, then clears categories cache.

Usage:
  node scripts/update-category-image-urls-in-db.mjs [options]

Options:
  --dry-run   Log only; no DB updates or cache clear
  --no-cache  Skip clearing categories cache after DB update
  --help, -h  Show this help
`);
}

const args = parseArgs();
if (args.help) {
  showHelp();
  process.exit(0);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.error("ERROR: Missing CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET");
  process.exit(1);
}
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

/** Public id for category image (filename = 1) */
function categoryPublicId(slug) {
  return `cozyberries/categories/${slug}/1`;
}

/** Fetch secure_url from Cloudinary Admin API for one resource. Returns null if not found. */
async function fetchCloudinaryUrlByPublicId(publicId) {
  try {
    const result = await cloudinary.api.resource(publicId, { resource_type: "image" });
    return result?.secure_url ?? null;
  } catch (err) {
    if (err?.error?.http_code === 404) return null;
    throw err;
  }
}

/** List resources in folder and return secure_url of first image (handles any filename). */
async function fetchCloudinaryUrlByPrefix(prefix) {
  try {
    const result = await cloudinary.api.resources({
      type: "upload",
      prefix: prefix,
      resource_type: "image",
      max_results: 10,
    });
    const resources = result?.resources ?? [];
    if (resources.length === 0) return null;
    // Prefer one named "1" or first in list
    const with1 = resources.find((r) => r.public_id === `${prefix}1` || r.public_id.endsWith("/1"));
    const chosen = with1 ?? resources[0];
    return chosen?.secure_url ?? null;
  } catch (err) {
    if (err?.error?.http_code === 404) return null;
    throw err;
  }
}

/** Fetch actual image URL from Cloudinary: try exact public_id first, then list folder. */
async function fetchCloudinaryUrl(slug) {
  const publicId = categoryPublicId(slug);
  let url = await fetchCloudinaryUrlByPublicId(publicId);
  if (url) return url;
  // Try with common extensions (public_id might be stored as "1.jpg" etc.)
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    url = await fetchCloudinaryUrlByPublicId(`${publicId}.${ext}`);
    if (url) return url;
  }
  // Fallback: list assets in cozyberries/categories/<slug>/
  const prefix = `cozyberries/categories/${slug}/`;
  return fetchCloudinaryUrlByPrefix(prefix);
}

/** Clear categories cache in Redis (categories:list, categories:options, etc.) */
async function clearCategoriesCache() {
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    console.warn("   ⚠ Skipping cache clear: UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set.");
    return;
  }
  const redis = new Redis({
    url: UPSTASH_REDIS_REST_URL,
    token: UPSTASH_REDIS_REST_TOKEN,
  });
  const keys = await redis.keys("categories:*");
  if (keys.length === 0) {
    console.log("   Cache: no categories keys found.");
    return;
  }
  await redis.del(...keys);
  console.log(`   Cache: cleared ${keys.length} key(s) (categories:*).`);
}

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   Update Category Image URLs from Cloudinary     ║");
  console.log("╚══════════════════════════════════════════════════╝\n");
  if (args.dryRun) console.log("   [DRY RUN]\n");

  const { data: categories, error: catError } = await supabase
    .from("categories")
    .select("id, name, slug");

  if (catError) {
    console.error("Failed to fetch categories:", catError.message);
    process.exit(1);
  }

  if (!categories?.length) {
    console.log("No categories found.");
    process.exit(0);
  }

  let updated = 0;
  let skipped = 0;
  for (const category of categories) {
    let url;
    if (args.dryRun) {
      const publicId = categoryPublicId(category.slug);
      console.log(`   [dry-run] ${category.name} (${category.slug}) -> fetch ${publicId}`);
      updated++;
      continue;
    }

    url = await fetchCloudinaryUrl(category.slug);
    if (!url) {
      console.warn(`   ⚠ ${category.name} (${category.slug}): no image in cozyberries/categories/${category.slug}/, skipping.`);
      skipped++;
      continue;
    }

    // Delete existing categories_images for this category
    const { error: delErr } = await supabase
      .from("categories_images")
      .delete()
      .eq("category_id", category.id);

    if (delErr) {
      console.warn(`   ⚠ Could not delete old images for ${category.name}:`, delErr.message);
    }

    // Insert single image row (filename = 1)
    const { error: insErr } = await supabase.from("categories_images").insert({
      category_id: category.id,
      url,
      storage_path: url,
      display_order: 0,
      is_primary: true,
    });

    if (insErr) {
      console.error(`   ✗ Failed to insert categories_images for ${category.name}:`, insErr.message);
      continue;
    }

    // Update categories.image for backward compatibility
    const { error: updErr } = await supabase
      .from("categories")
      .update({ image: url })
      .eq("id", category.id);

    if (updErr) {
      console.warn(`   ⚠ Could not update categories.image for ${category.name}:`, updErr.message);
    }

    updated++;
    console.log(`   ✓ ${category.name} (${category.slug})`);
  }

  // Clear categories cache unless dry-run or --no-cache
  if (!args.dryRun && !args.noCache) {
    console.log("");
    await clearCategoriesCache();
  }

  console.log("\n══════════════════════════════════════════════════");
  console.log(`Done. ${updated} categor${updated === 1 ? "y" : "ies"} updated${skipped ? `, ${skipped} skipped (no image on Cloudinary)` : ""}.`);
  console.log("══════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
