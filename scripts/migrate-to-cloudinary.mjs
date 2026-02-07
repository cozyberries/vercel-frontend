#!/usr/bin/env node

/**
 * Migrate Product Images to Cloudinary
 *
 * Uploads all product images from local folders to Cloudinary,
 * then updates the Supabase `products` table with new Cloudinary URLs.
 *
 * Usage:  node scripts/migrate-to-cloudinary.mjs
 * Prereq: .env must contain CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
 *         CLOUDINARY_API_SECRET and Supabase credentials.
 */

import { v2 as cloudinary } from "cloudinary";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { config } from "dotenv";

// ── Configuration ────────────────────────────────────────────────────────────

// Load .env.local first so its values take precedence (dotenv won't overwrite)
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

// Paths
const CATALOGUE_CSV = resolve(
  process.cwd(),
  "../Product Catalogue/Catalogue_With_Photoshoots.csv"
);
const IMAGES_BASE = resolve(process.cwd(), "../Product Catalogue");

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
  const lines = content.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => {
      const values = line.split(",");
      const row = {};
      headers.forEach((h, i) => {
        row[h] = (values[i] || "").trim();
      });
      return row;
    });
}

/**
 * Upload a local file to Cloudinary.
 * Returns the secure_url on success, null on failure.
 */
async function uploadToCloudinary(localFilePath, publicId, folder) {
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
    console.error(`   ✗ Cloudinary upload failed for ${localFilePath}: ${err.message}`);
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   Migrate Product Images to Cloudinary           ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // ─── 1. Parse CSV ───────────────────────────────────────────────────────
  console.log("1. Parsing CSV...");
  const csvContent = readFileSync(CATALOGUE_CSV, "utf-8");
  const rows = parseCSV(csvContent);
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

    // Upload each image to Cloudinary
    const cloudinaryUrls = [];
    const cloudinaryFolder = `cozyberries/products/${slug}`;

    for (const imgFile of imageFiles) {
      const localPath = join(localFolder, imgFile);
      const publicId = imgFile.replace(/\.[^.]+$/, ""); // e.g. "1", "2", etc.

      const url = await uploadToCloudinary(localPath, publicId, cloudinaryFolder);
      if (url) {
        cloudinaryUrls.push(url);
        totalUploaded++;
      }
    }

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
