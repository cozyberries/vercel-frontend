#!/usr/bin/env node

/**
 * Migrate Product Images to Cloudinary
 *
 * Uploads all product images from local folders to Cloudinary,
 * then updates the Supabase `products` table with new Cloudinary URLs.
 *
 * Usage:
 *   node scripts/migrate-to-cloudinary.mjs [options]
 *   node scripts/migrate-to-cloudinary.mjs --help
 *
 * Options:
 *   --catalogue-csv=PATH   Path to catalogue CSV (default: ../Product Catalogue/Catalogue_With_Photoshoots.csv)
 *   --images-base=PATH     Base directory for product image folders (default: ../Product Catalogue)
 *   -c, --catalogue-csv    Same as --catalogue-csv (value as next arg or =PATH)
 *   -i, --images-base      Same as --images-base (value as next arg or =PATH)
 *
 * Environment (overridden by CLI):
 *   CATALOGUE_CSV          Path to catalogue CSV
 *   IMAGES_BASE            Base directory for product image folders
 *
 * Prereq: .env must contain CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
 *         CLOUDINARY_API_SECRET and Supabase credentials.
 */

import { v2 as cloudinary } from "cloudinary";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { config } from "dotenv";
import { parse } from "csv-parse/sync";

// ── Configuration ────────────────────────────────────────────────────────────

// Load .env.local first so its values take precedence (dotenv won't overwrite)
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const DEFAULT_CATALOGUE_CSV = resolve(
  process.cwd(),
  "../Product Catalogue/Catalogue_With_Photoshoots.csv"
);
const DEFAULT_IMAGES_BASE = resolve(process.cwd(), "../Product Catalogue");

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { catalogueCsv: null, imagesBase: null, help: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      return out;
    }
    if (arg === "--catalogue-csv" || arg === "-c") {
      out.catalogueCsv = args[i + 1] ?? null;
      if (out.catalogueCsv) i++;
      continue;
    }
    if (arg === "--images-base" || arg === "-i") {
      out.imagesBase = args[i + 1] ?? null;
      if (out.imagesBase) i++;
      continue;
    }
    if (arg.startsWith("--catalogue-csv=")) {
      out.catalogueCsv = arg.slice("--catalogue-csv=".length);
      continue;
    }
    if (arg.startsWith("--images-base=")) {
      out.imagesBase = arg.slice("--images-base=".length);
      continue;
    }
  }
  return out;
}

function showHelp() {
  console.log(`
Migrate Product Images to Cloudinary

Usage:
  node scripts/migrate-to-cloudinary.mjs [options]

Options:
  --catalogue-csv=PATH   Path to catalogue CSV
  -c PATH                Shorthand for --catalogue-csv
  --images-base=PATH     Base directory for product image folders
  -i PATH                Shorthand for --images-base
  --help, -h             Show this help

Environment (used if option not provided):
  CATALOGUE_CSV          Path to catalogue CSV
  IMAGES_BASE            Base directory for product image folders

Defaults (if neither env nor option is set):
  catalogue-csv: ${DEFAULT_CATALOGUE_CSV}
  images-base:   ${DEFAULT_IMAGES_BASE}
`);
}

const cli = parseArgs();
if (cli.help) {
  showHelp();
  process.exit(0);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

const CATALOGUE_CSV = resolve(
  cli.catalogueCsv ?? process.env.CATALOGUE_CSV ?? DEFAULT_CATALOGUE_CSV
);
const IMAGES_BASE = resolve(
  cli.imagesBase ?? process.env.IMAGES_BASE ?? DEFAULT_IMAGES_BASE
);

// Validate env
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.error(
    "ERROR: Missing CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET"
  );
  process.exit(1);
}

// ── Init clients ─────────────────────────────────────────────────────────────

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
  secure: true,
});

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseCSV(content) {
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: false,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const UPLOAD_CONCURRENCY = 5;
const UPLOAD_DELAY_MS = 100;
const RATE_LIMIT_MAX_RETRIES = 3;
const RATE_LIMIT_BASE_MS = 2000;

function isRateLimitError(err) {
  const code = err.error?.http_code ?? err.response?.statusCode ?? err.statusCode;
  return code === 429;
}

/**
 * Upload a local file to Cloudinary with retry on 429.
 * Returns the secure_url on success, null on failure.
 */
async function uploadToCloudinary(localFilePath, publicId, folder) {
  let lastErr;
  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    try {
      const result = await cloudinary.uploader.upload(localFilePath, {
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
      if (isRateLimitError(err) && attempt < RATE_LIMIT_MAX_RETRIES) {
        const delayMs = RATE_LIMIT_BASE_MS * Math.pow(2, attempt);
        console.error(
          `   ⚠ Rate limited (429) for ${localFilePath}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${RATE_LIMIT_MAX_RETRIES})`
        );
        await sleep(delayMs);
      } else {
        console.error(
          `   ✗ Cloudinary upload failed for ${localFilePath}: ${err.message}`
        );
        return null;
      }
    }
  }
  console.error(
    `   ✗ Cloudinary upload failed for ${localFilePath}: ${lastErr?.message}`
  );
  return null;
}

/**
 * Run async tasks with bounded concurrency.
 * @param {Array<() => Promise<T>>} taskFns - Array of functions that return promises
 * @param {number} concurrency - Max number of concurrent runs
 * @returns {Promise<T[]>} Results in same order as taskFns
 */
async function runWithConcurrency(taskFns, concurrency = UPLOAD_CONCURRENCY) {
  const results = [];
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < taskFns.length) {
      const i = nextIndex++;
      results[i] = await taskFns[i]();
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, taskFns.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   Migrate Product Images to Cloudinary           ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // ─── 1. Parse CSV ───────────────────────────────────────────────────────
  console.log("1. Parsing CSV...");
  let csvContent;
  let rows;
  try {
    csvContent = readFileSync(CATALOGUE_CSV, "utf-8");
    rows = parseCSV(csvContent);
  } catch (err) {
    console.error(
      `ERROR: Failed to read or parse catalogue CSV at "${CATALOGUE_CSV}":`,
      err.message
    );
    console.error(err);
    process.exit(1);
  }
  console.log(`   Found ${rows.length} products in CSV.\n`);

  // ─── 2. Fetch existing products from Supabase ──────────────────────────
  console.log("2. Fetching existing products from Supabase...");
  const { data: existingProducts, error: fetchErr } = await supabase
    .from("products")
    .select("id, name, slug, images");

  if (fetchErr) {
    console.error(`   ✗ Failed to fetch products: ${fetchErr.message}`);
    process.exit(1);
  }
  console.log(`   Found ${existingProducts.length} products in database.\n`);

  // Build a map of slug → product for quick lookup
  const productBySlug = {};
  for (const p of existingProducts) {
    productBySlug[p.slug] = p;
  }

  // ─── 3. Upload images to Cloudinary & update Supabase ─────────────────
  console.log("3. Uploading images to Cloudinary...\n");

  let totalUploaded = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const row of rows) {
    const title = row["Product Title"];
    const slug = buildSlug(title);
    const folderPath = row["Folder Path"];
    const localFolder = resolve(IMAGES_BASE, folderPath);

    const product = productBySlug[slug];
    if (!product) {
      console.log(`   ⚠ No DB product found for "${title}" (slug: ${slug}). Skipping.`);
      totalSkipped++;
      continue;
    }

    // Discover local image files
    let imageFiles = [];
    try {
      imageFiles = readdirSync(localFolder)
        .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
        .sort((a, b) => {
          const numA = parseInt(a, 10);
          const numB = parseInt(b, 10);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.localeCompare(b);
        });
    } catch (err) {
      console.error(`   ✗ Cannot read folder "${localFolder}": ${err.message}`);
      totalFailed++;
      continue;
    }

    if (imageFiles.length === 0) {
      console.log(`   ⚠ No images found for "${title}". Skipping.`);
      totalSkipped++;
      continue;
    }

    // Upload each image to Cloudinary with bounded concurrency and rate limiting
    const cloudinaryFolder = `cozyberries/products/${slug}`;
    const uploadTasks = imageFiles.map((imgFile) => {
      const localPath = join(localFolder, imgFile);
      const publicId = imgFile.replace(/\.[^.]+$/, ""); // e.g. "1", "2", etc.
      return async () => {
        const url = await uploadToCloudinary(
          localPath,
          publicId,
          cloudinaryFolder
        );
        await sleep(UPLOAD_DELAY_MS);
        return url;
      };
    });

    const uploadResults = await runWithConcurrency(uploadTasks, UPLOAD_CONCURRENCY);
    const cloudinaryUrls = uploadResults.filter(Boolean);
    totalUploaded += cloudinaryUrls.length;

    if (cloudinaryUrls.length === 0) {
      console.log(`   ✗ All uploads failed for "${title}".`);
      totalFailed++;
      continue;
    }

    // Update Supabase product with new Cloudinary URLs
    const { error: updateErr } = await supabase
      .from("products")
      .update({ images: cloudinaryUrls })
      .eq("id", product.id);

    if (updateErr) {
      console.error(
        `   ✗ Failed to update "${title}" in Supabase: ${updateErr.message}`
      );
      totalFailed++;
    } else {
      totalUpdated++;
      console.log(
        `   ✓ ${title}: ${cloudinaryUrls.length} images uploaded & DB updated`
      );
    }
  }

  // ─── 4. Summary ───────────────────────────────────────────────────────
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`Migration Complete!`);
  console.log(`  Images uploaded:   ${totalUploaded}`);
  console.log(`  Products updated:  ${totalUpdated}`);
  console.log(`  Products skipped:  ${totalSkipped}`);
  console.log(`  Products failed:   ${totalFailed}`);
  console.log(`══════════════════════════════════════════════════\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
