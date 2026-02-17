#!/usr/bin/env node

/**
 * Migrate All Images to Cloudinary
 *
 * - Categories: uploads category.image (Supabase or other URL) to Cloudinary, updates DB.
 * - Products: for each product.images entry that is not already Cloudinary, uploads and replaces with Cloudinary URL.
 *
 * Usage:
 *   node scripts/migrate-all-images-to-cloudinary.mjs [options]
 *   node scripts/migrate-all-images-to-cloudinary.mjs --help
 *
 * Options:
 *   --dry-run    Log what would be done without updating DB or uploading.
 *   --categories-only   Only migrate category images.
 *   --products-only     Only migrate product images.
 *
 * Prereq: .env must contain CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
 *         CLOUDINARY_API_SECRET and Supabase credentials.
 */

import { v2 as cloudinary } from "cloudinary";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

const CLOUDINARY_HOST = "res.cloudinary.com";
function isCloudinaryUrl(url) {
  if (!url || typeof url !== "string") return false;
  return url.includes(CLOUDINARY_HOST);
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
    categoriesOnly: args.includes("--categories-only"),
    productsOnly: args.includes("--products-only"),
    help: args.includes("--help") || args.includes("-h"),
  };
}

function showHelp() {
  console.log(`
Migrate All Images to Cloudinary

  Migrates category images (categories.image) and product images (products.images)
  from Supabase storage or other URLs to Cloudinary and updates the database.

Usage:
  node scripts/migrate-all-images-to-cloudinary.mjs [options]

Options:
  --dry-run           Log actions only; do not upload or update DB.
  --categories-only   Only migrate category images.
  --products-only     Only migrate product images.
  --help, -h           Show this help.

Environment: CLOUDINARY_*, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
`);
}

const args = parseArgs();
if (args.help) {
  showHelp();
  process.exit(0);
}

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

const UPLOAD_DELAY_MS = 400;
const RATE_LIMIT_MAX_RETRIES = 3;
const RATE_LIMIT_BASE_MS = 2000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimitError(err) {
  const code = err?.error?.http_code ?? err?.http_code;
  return code === 429;
}

/**
 * Upload from remote URL to Cloudinary. Returns secure_url or null.
 */
async function uploadFromUrl(sourceUrl, folder, publicId) {
  let lastErr;
  for (let attempt = 0; attempt < RATE_LIMIT_MAX_RETRIES; attempt++) {
    try {
      const result = await cloudinary.uploader.upload(sourceUrl, {
        public_id: publicId,
        folder: folder,
        overwrite: true,
        resource_type: "image",
        quality: "auto",
        fetch_format: "auto",
      });
      return result.secure_url;
    } catch (err) {
      lastErr = err;
      if (isRateLimitError(err) && attempt < RATE_LIMIT_MAX_RETRIES - 1) {
        const delayMs = RATE_LIMIT_BASE_MS * Math.pow(2, attempt);
        console.warn(`   ⚠ Rate limited, retrying in ${delayMs}ms...`);
        await sleep(delayMs);
      } else {
        console.error(`   ✗ Upload failed for ${sourceUrl?.slice(0, 60)}...: ${err.message}`);
        return null;
      }
    }
  }
  return null;
}

async function migrateCategories() {
  console.log("\n── Categories ─────────────────────────────────────────");
  const { data: categories, error } = await supabase
    .from("categories")
    .select("id, name, slug, image");

  if (error) {
    console.error("   ✗ Failed to fetch categories:", error.message);
    return { updated: 0, skipped: 0, failed: 0 };
  }

  let updated = 0,
    skipped = 0,
    failed = 0;

  for (const cat of categories || []) {
    const img = cat.image;
    if (!img || typeof img !== "string" || img.trim() === "") {
      skipped++;
      continue;
    }
    if (isCloudinaryUrl(img)) {
      skipped++;
      continue;
    }
    if (args.dryRun) {
      console.log(`   [dry-run] Would migrate category "${cat.name}" (${cat.slug})`);
      updated++;
      continue;
    }
    const publicId = (cat.slug || cat.id).replace(/\s+/g, "-").toLowerCase();
    const url = await uploadFromUrl(img, "cozyberries/categories", publicId);
    await sleep(UPLOAD_DELAY_MS);
    if (!url) {
      failed++;
      continue;
    }
    const { error: updateErr } = await supabase
      .from("categories")
      .update({ image: url })
      .eq("id", cat.id);
    if (updateErr) {
      console.error(`   ✗ DB update failed for ${cat.name}:`, updateErr.message);
      failed++;
    } else {
      console.log(`   ✓ ${cat.name} → Cloudinary`);
      updated++;
    }
  }

  console.log(`   Categories: ${updated} updated, ${skipped} skipped, ${failed} failed`);
  return { updated, skipped, failed };
}

async function migrateProducts() {
  console.log("\n── Products ─────────────────────────────────────────");
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, slug, images");

  if (error) {
    console.error("   ✗ Failed to fetch products:", error.message);
    return { updated: 0, skipped: 0, failed: 0 };
  }

  let updated = 0,
    skipped = 0,
    failed = 0;

  for (const product of products || []) {
    let images = product.images;
    if (!Array.isArray(images)) {
      if (typeof images === "string") {
        try {
          images = images.trim().startsWith("[") ? JSON.parse(images) : [images];
        } catch {
          images = [];
        }
      } else {
        images = [];
      }
    }
    const newUrls = [];
    let changed = false;
    for (let i = 0; i < images.length; i++) {
      const u = images[i];
      const url = typeof u === "string" ? u : u?.url || u?.storage_path;
      if (!url || typeof url !== "string") {
        continue;
      }
      if (isCloudinaryUrl(url)) {
        newUrls.push(url);
        continue;
      }
      changed = true;
      if (args.dryRun) {
        newUrls.push(url);
        continue;
      }
      const publicId = `${i + 1}`;
      const folder = `cozyberries/products/${product.slug || product.id}`;
      const cloudinaryUrl = await uploadFromUrl(url, folder, publicId);
      await sleep(UPLOAD_DELAY_MS);
      if (cloudinaryUrl) {
        newUrls.push(cloudinaryUrl);
      } else {
        newUrls.push(url);
      }
    }
    if (!changed) {
      skipped++;
      continue;
    }
    if (args.dryRun) {
      console.log(`   [dry-run] Would migrate product "${product.name}" (${product.slug})`);
      updated++;
      continue;
    }
    const { error: updateErr } = await supabase
      .from("products")
      .update({ images: newUrls })
      .eq("id", product.id);
    if (updateErr) {
      console.error(`   ✗ DB update failed for ${product.name}:`, updateErr.message);
      failed++;
    } else {
      console.log(`   ✓ ${product.name} (${newUrls.length} images)`);
      updated++;
    }
  }

  console.log(`   Products: ${updated} updated, ${skipped} skipped, ${failed} failed`);
  return { updated, skipped, failed };
}

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   Migrate All Images to Cloudinary               ║");
  console.log("╚══════════════════════════════════════════════════╝");
  if (args.dryRun) console.log("\n   [DRY RUN - no uploads or DB updates]\n");

  const doCategories = !args.productsOnly;
  const doProducts = !args.categoriesOnly;

  let catStats = { updated: 0, skipped: 0, failed: 0 };
  let prodStats = { updated: 0, skipped: 0, failed: 0 };

  if (doCategories) catStats = await migrateCategories();
  if (doProducts) prodStats = await migrateProducts();

  console.log("\n══════════════════════════════════════════════════");
  console.log("Done.");
  if (doCategories) console.log(`  Categories: ${catStats.updated} updated, ${catStats.skipped} skipped, ${catStats.failed} failed`);
  if (doProducts) console.log(`  Products:   ${prodStats.updated} updated, ${prodStats.skipped} skipped, ${prodStats.failed} failed`);
  console.log("══════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
