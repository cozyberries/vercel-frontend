#!/usr/bin/env node
/**
 * Preprocesses all product images in Supabase Storage.
 * For each source JPEG/PNG, generates 6 variants:
 *   - {name}_list.webp / {name}_list.avif        (750×750, q70)
 *   - {name}_detail.webp / {name}_detail.avif    (1000×1000, q90)
 *   - {name}_thumbnail.webp / {name}_thumbnail.avif (120×120, q75)
 *
 * Re-runnable: existing variants are overwritten (upsert).
 * Source images are identified by .jpg/.jpeg/.png extension without a preset suffix.
 *
 * Usage: node scripts/preprocess-images.mjs
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { readFileSync } from "fs";

// --- Load .env.local ---
function loadEnv() {
  const env = {};
  try {
    const lines = readFileSync(".env.local", "utf8").split("\n");
    for (const line of lines) {
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key) env[key] = val;
    }
  } catch {
    // .env.local not found — fall back to process.env
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "media";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const PRESETS = {
  list:      { width: 750,  height: 750,  quality: 70 },
  detail:    { width: 1000, height: 1000, quality: 90 },
  thumbnail: { width: 120,  height: 120,  quality: 75 },
};
const FORMATS = ["webp", "avif"];
const PRESET_SUFFIX_RE = /_(list|detail|thumbnail)\.(webp|avif)$/i;
const SOURCE_EXT_RE = /\.(jpg|jpeg|png)$/i;

// --- List all product image objects ---
async function listProductFolders() {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list("products", { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) throw new Error(`Failed to list products/: ${error.message}`);
  return (data ?? []).filter((item) => !item.id); // folders have no id
}

async function listFolderImages(slug) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(`products/${slug}`, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) throw new Error(`Failed to list products/${slug}: ${error.message}`);
  return (data ?? []).filter(
    (item) => SOURCE_EXT_RE.test(item.name) && !PRESET_SUFFIX_RE.test(item.name)
  );
}

// --- Download a storage object as a Buffer ---
async function downloadImage(path) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw new Error(`Download failed for ${path}: ${error.message}`);
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// --- Generate a single variant with Sharp ---
async function generateVariant(buffer, width, height, quality, format) {
  const pipeline = sharp(buffer).resize(width, height, { fit: "cover", position: "center" });
  if (format === "webp") return pipeline.webp({ quality }).toBuffer();
  if (format === "avif") return pipeline.avif({ quality }).toBuffer();
  throw new Error(`Unsupported format: ${format}`);
}

// --- Upload a variant buffer to storage ---
async function uploadVariant(path, buffer, format) {
  const mimeType = format === "webp" ? "image/webp" : "image/avif";
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) throw new Error(`Upload failed for ${path}: ${error.message}`);
}

// --- Derive variant path from source path ---
function variantPath(sourcePath, preset, format) {
  const dotIdx = sourcePath.lastIndexOf(".");
  const base = dotIdx !== -1 ? sourcePath.slice(0, dotIdx) : sourcePath;
  return `${base}_${preset}.${format}`;
}

// --- Main ---
async function main() {
  console.log("Fetching product folders…");
  const folders = await listProductFolders();
  console.log(`Found ${folders.length} product folder(s)\n`);

  let totalProcessed = 0;
  let totalFailed = 0;

  for (const folder of folders) {
    const slug = folder.name;
    let images;
    try {
      images = await listFolderImages(slug);
    } catch (err) {
      console.error(`  [ERROR] ${slug}: ${err.message}`);
      totalFailed++;
      continue;
    }

    for (const image of images) {
      const sourcePath = `products/${slug}/${image.name}`;
      process.stdout.write(`  ${sourcePath} … `);
      try {
        const buffer = await downloadImage(sourcePath);
        for (const [preset, { width, height, quality }] of Object.entries(PRESETS)) {
          for (const format of FORMATS) {
            const variantBuffer = await generateVariant(buffer, width, height, quality, format);
            const vPath = variantPath(sourcePath, preset, format);
            await uploadVariant(vPath, variantBuffer, format);
          }
        }
        process.stdout.write("done\n");
        totalProcessed++;
      } catch (err) {
        process.stdout.write(`FAILED\n`);
        console.error(`    ${err.message}`);
        totalFailed++;
      }
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Processed: ${totalProcessed}`);
  console.log(`Failed:    ${totalFailed}`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
