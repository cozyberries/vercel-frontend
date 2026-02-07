#!/usr/bin/env node

/**
 * Seed Products Script
 *
 * Reads Catalogue_With_Photoshoots.csv, uploads product images to Supabase Storage
 * (bucket: media), truncates existing products, and reseeds the products table.
 *
 * Usage:  node scripts/seed-products.mjs
 * Prereq: .env.local must contain NEXT_PUBLIC_SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { config } from "dotenv";

// ── Configuration ────────────────────────────────────────────────────────────

config({ path: resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORAGE_BUCKET = "media";

// Paths relative to the vercel-frontend directory
const CATALOGUE_CSV = resolve(
  process.cwd(),
  "../Product Catalogue/Catalogue_With_Photoshoots.csv"
);
const IMAGES_BASE = resolve(process.cwd(), "../Product Catalogue");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a URL-safe slug from a product name (mirrors the API route logic). */
function buildSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Deterministic price from slug string → 200-600 INR in steps of 50. */
function deterministicPrice(slug) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = ((hash << 5) - hash + slug.charCodeAt(i)) | 0;
  }
  const steps = [200, 250, 300, 350, 400, 450, 500, 550, 600];
  return steps[Math.abs(hash) % steps.length];
}

/** Parse a simple CSV string into an array of objects keyed by the header row. */
function parseCSV(content) {
  const lines = content.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => {
      // Handle commas inside quoted fields (not expected here, but safe)
      const values = line.split(",");
      const row = {};
      headers.forEach((h, i) => {
        row[h] = (values[i] || "").trim();
      });
      return row;
    });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║     Product Seeding Script               ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // ─── 1. Parse CSV ───────────────────────────────────────────────────────
  console.log("1. Parsing CSV...");
  const csvContent = readFileSync(CATALOGUE_CSV, "utf-8");
  const rows = parseCSV(csvContent);
  console.log(`   Found ${rows.length} products in CSV.\n`);

  // ─── 2. Upsert categories ──────────────────────────────────────────────
  console.log("2. Upserting categories...");
  const categoryNames = [...new Set(rows.map((r) => r["Category"]))];
  const categoryMap = {}; // categoryName → uuid

  for (const catName of categoryNames) {
    const catSlug = buildSlug(catName);

    // Check if category already exists
    const { data: existing } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", catSlug)
      .single();

    if (existing) {
      categoryMap[catName] = existing.id;
      console.log(`   ✓ "${catName}" exists (${existing.id})`);
    } else {
      const { data: created, error } = await supabase
        .from("categories")
        .insert({ name: catName, slug: catSlug, display: true })
        .select("id")
        .single();

      if (error) {
        console.error(`   ✗ Failed to create "${catName}": ${error.message}`);
        continue;
      }
      categoryMap[catName] = created.id;
      console.log(`   + Created "${catName}" (${created.id})`);
    }
  }
  console.log();

  // ─── 3. Upload images & build product rows ─────────────────────────────
  console.log("3. Uploading images to Supabase Storage...");
  const productRows = [];

  for (const row of rows) {
    const title = row["Product Title"];
    const slug = buildSlug(title);
    const category = row["Category"];
    const folderPath = row["Folder Path"];
    const gender = row["Gender"] || "";
    const style = row["Style"] || "";
    const variant = row["Variant"] || "";

    const localFolder = resolve(IMAGES_BASE, folderPath);

    // Discover image files (skip Thumbs.db, .DS_Store, etc.)
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
    }

    const imageUrls = [];

    for (const imgFile of imageFiles) {
      const storagePath = `products/${slug}/${imgFile}`;
      const localPath = join(localFolder, imgFile);
      const fileBuffer = readFileSync(localPath);

      const ext = imgFile.split(".").pop().toLowerCase();
      const mimeMap = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
      const contentType = mimeMap[ext] || "image/jpeg";

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error(
          `   ✗ Upload failed ${storagePath}: ${uploadError.message}`
        );
        continue;
      }

      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`;
      imageUrls.push(publicUrl);
    }

    console.log(`   ✓ ${title}: ${imageUrls.length} images`);

    // Build a light description from CSV metadata
    const descParts = [];
    if (style) descParts.push(`Style: ${style}`);
    if (variant) descParts.push(`Print: ${variant}`);
    if (gender) descParts.push(`Gender: ${gender}`);
    const description =
      descParts.length > 0
        ? `${title}. ${descParts.join(". ")}.`
        : title;

    productRows.push({
      name: title,
      slug,
      description,
      price: deterministicPrice(slug),
      category_id: categoryMap[category] || null,
      stock_quantity: 50,
      is_featured: false,
      images: imageUrls,
    });
  }

  console.log(`\n   Prepared ${productRows.length} product rows.\n`);

  // ─── 4. Delete existing data ───────────────────────────────────────────
  console.log("4. Deleting existing data...");

  // Delete product_images first (FK child of products)
  const { error: delImagesErr } = await supabase
    .from("product_images")
    .delete()
    .not("id", "is", null);

  if (delImagesErr) {
    console.warn(
      `   ⚠ product_images: ${delImagesErr.message} (table may not exist — OK)`
    );
  } else {
    console.log("   ✓ Cleared product_images.");
  }

  // Delete all products
  const { error: delProductsErr } = await supabase
    .from("products")
    .delete()
    .not("id", "is", null);

  if (delProductsErr) {
    console.error(`   ✗ products delete failed: ${delProductsErr.message}`);
    process.exit(1);
  }
  console.log("   ✓ Cleared products.\n");

  // ─── 5. Insert new products in batches ─────────────────────────────────
  console.log("5. Inserting new products...");
  const BATCH_SIZE = 10;
  let inserted = 0;

  for (let i = 0; i < productRows.length; i += BATCH_SIZE) {
    const batch = productRows.slice(i, i + BATCH_SIZE);
    const { error: insertErr } = await supabase
      .from("products")
      .insert(batch);

    if (insertErr) {
      console.error(
        `   ✗ Batch at offset ${i} failed: ${insertErr.message}`
      );
      // Fall back to one-by-one insertion for this batch
      for (const row of batch) {
        const { error: singleErr } = await supabase
          .from("products")
          .insert([row]);
        if (singleErr) {
          console.error(`     ✗ "${row.name}": ${singleErr.message}`);
        } else {
          inserted++;
        }
      }
    } else {
      inserted += batch.length;
      console.log(
        `   ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} products`
      );
    }
  }

  console.log(
    `\n══════════════════════════════════════════`
  );
  console.log(
    `Done! Inserted ${inserted}/${productRows.length} products.`
  );
  console.log(
    `══════════════════════════════════════════\n`
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
