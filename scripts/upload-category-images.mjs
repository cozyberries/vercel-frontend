#!/usr/bin/env node

/**
 * Upload category images from "Product Catalogue/Categories" to Cloudinary
 * and update categories_images + categories.image in Supabase.
 *
 * Images are discovered by slug: files named <slug>.png, <slug>-2.png, etc.
 * Run scripts/rename-category-images-to-slugs.mjs first if your files use other names.
 *
 * Usage:
 *   node scripts/upload-category-images.mjs [options]
 *   node scripts/upload-category-images.mjs --help
 *
 * Options:
 *   --categories-dir=PATH   Path to folder containing category images (default: ../Product Catalogue/Categories)
 *   --dry-run              Log only; no uploads or DB updates.
 */

import { v2 as cloudinary } from "cloudinary";
import { createClient } from "@supabase/supabase-js";
import { readdirSync, existsSync, statSync } from "fs";
import { join, resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const DEFAULT_CATEGORIES_DIR = resolve(process.cwd(), "../Product Catalogue/Categories");
const IMAGE_EXT = /\.(png|jpg|jpeg|webp)$/i;

/** Normalize folder name to category slug: "Girls Coord sets" → "girls-coord-sets" */
function folderNameToSlug(dirName) {
  return dirName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

// Discover images by slug: <slug>.ext or <slug>-N.ext (N ≥ 2) in the root of categoriesDir
function discoverBySlug(categoriesDir, slugs) {
  const files = readdirSync(categoriesDir).filter((f) => IMAGE_EXT.test(f));
  const mapping = {};
  for (const slug of slugs) {
    const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${escaped}(-([0-9]+))?\\.[a-z]+$`, "i");
    const matched = files
      .filter((f) => re.test(f))
      .sort((a, b) => {
        const aNum = (a.match(/-([0-9]+)\.[a-z]+$/i)?.[1]) || "1";
        const bNum = (b.match(/-([0-9]+)\.[a-z]+$/i)?.[1]) || "1";
        const n = (s) => (s === "1" ? 0 : parseInt(s, 10));
        return n(aNum) - n(bNum);
      });
    if (matched.length) mapping[slug] = matched;
  }
  return mapping;
}

// Discover images from subfolders: e.g. "Girls Coord sets/1.png" → slug girls-coord-sets
function discoverFromSubfolders(categoriesDir, slugs) {
  const slugSet = new Set(slugs);
  const mapping = {};
  const entries = readdirSync(categoriesDir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
    const slug = folderNameToSlug(ent.name);
    if (!slugSet.has(slug)) continue;
    const subDir = join(categoriesDir, ent.name);
    const files = readdirSync(subDir)
      .filter((f) => IMAGE_EXT.test(f))
      .sort((a, b) => {
        const aNum = (a.match(/^(\d+)/)?.[1]) ?? (a.match(/(\d+)/)?.[1]) ?? "0";
        const bNum = (b.match(/^(\d+)/)?.[1]) ?? (b.match(/(\d+)/)?.[1]) ?? "0";
        return parseInt(aNum, 10) - parseInt(bNum, 10);
      });
    if (files.length) mapping[slug] = files.map((f) => join(subDir, f));
  }
  return mapping;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let categoriesDir = null;
  let dryRun = false;
  let help = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") dryRun = true;
    else if (args[i] === "--help" || args[i] === "-h") help = true;
    else if (args[i].startsWith("--categories-dir=")) categoriesDir = args[i].slice("--categories-dir=".length);
  }
  return { categoriesDir, dryRun, help };
}

function showHelp() {
  console.log(`
Upload category images to Cloudinary and update DB

  Reads images from Product Catalogue/Categories (or --categories-dir),
  uploads to Cloudinary (cozyberries/categories/<slug>/1, 2, ...),
  then updates categories_images and categories.image.

Usage:
  node scripts/upload-category-images.mjs [options]

Options:
  --categories-dir=PATH   Folder containing category images (files named <slug>.png, <slug>-2.png, ...)
  --dry-run              Log only; no uploads or DB updates
  --help, -h             Show this help

Default categories dir: ${DEFAULT_CATEGORIES_DIR}
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

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.error("ERROR: Missing CLOUDINARY_* env vars");
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
const categoriesDir = resolve(args.categoriesDir ?? DEFAULT_CATEGORIES_DIR);


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

async function uploadFile(localPath, folder, publicId) {
  let lastErr;
  for (let attempt = 0; attempt < RATE_LIMIT_MAX_RETRIES; attempt++) {
    try {
      const result = await cloudinary.uploader.upload(localPath, {
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
        await sleep(RATE_LIMIT_BASE_MS * Math.pow(2, attempt));
      } else {
        console.error(`   ✗ Upload failed ${localPath}:`, err.message);
        return null;
      }
    }
  }
  return null;
}

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   Upload Category Images → Cloudinary & DB       ║");
  console.log("╚══════════════════════════════════════════════════╝\n");
  if (args.dryRun) console.log("   [DRY RUN]\n");

  if (!existsSync(categoriesDir)) {
    console.error(`ERROR: Categories dir not found: ${categoriesDir}`);
    process.exit(1);
  }

  const { data: categories, error: catError } = await supabase
    .from("categories")
    .select("id, name, slug");

  if (catError) {
    console.error("Failed to fetch categories:", catError.message);
    process.exit(1);
  }

  const slugs = categories.map((c) => c.slug);
  const flatMapping = discoverBySlug(categoriesDir, slugs);
  const subfolderMapping = discoverFromSubfolders(categoriesDir, slugs);
  // Merge: per slug, use subfolder paths if present, else flat filenames (resolve to full paths)
  const mapping = {};
  for (const slug of slugs) {
    if (subfolderMapping[slug]?.length) {
      mapping[slug] = subfolderMapping[slug];
    } else if (flatMapping[slug]?.length) {
      mapping[slug] = flatMapping[slug].map((f) => join(categoriesDir, f));
    }
  }
  const slugToCategory = new Map(categories.map((c) => [c.slug, c]));
  let totalUploaded = 0;
  let categoriesUpdated = 0;

  for (const [slug, filePaths] of Object.entries(mapping)) {
    if (!Array.isArray(filePaths) || filePaths.length === 0) continue;

    const category = slugToCategory.get(slug);
    if (!category) {
      console.warn(`   ⚠ No category for slug "${slug}", skipping.`);
      continue;
    }

    const toUpload = filePaths.filter((p) => existsSync(p));
    if (toUpload.length === 0) continue;

    const folder = `cozyberries/categories/${slug}`;
    const urls = [];

    if (args.dryRun) {
      console.log(`   [dry-run] ${category.name}: would upload ${toUpload.length} image(s)`);
      categoriesUpdated++;
      continue;
    }

    for (let i = 0; i < toUpload.length; i++) {
      const localPath = toUpload[i];
      const publicId = `${i + 1}`;
      const url = await uploadFile(localPath, folder, publicId);
      await sleep(UPLOAD_DELAY_MS);
      if (url) urls.push(url);
    }

    if (urls.length === 0) {
      console.warn(`   ✗ ${category.name}: no successful uploads`);
      continue;
    }

    // storage_path: store canonical Cloudinary relative path (public_id) so URLs can be rebuilt from config; url keeps full URL for display/backward compat
    const rows = urls.map((url, i) => ({
      category_id: category.id,
      url,
      storage_path: `cozyberries/categories/${slug}/${i + 1}`,
      display_order: i,
      is_primary: i === 0,
    }));

    const { data: insertedRows, error: insErr } = await supabase
      .from("categories_images")
      .insert(rows)
      .select("id");

    if (insErr) {
      console.error(`   ✗ Failed to insert categories_images for ${category.name}:`, insErr.message);
      continue;
    }

    const newIds = (insertedRows || []).map((r) => r.id);
    if (newIds.length > 0) {
      const inList = newIds.map((id) => (typeof id === "string" ? `"${id}"` : id)).join(",");
      const { error: delErr } = await supabase
        .from("categories_images")
        .delete()
        .eq("category_id", category.id)
        .not("id", "in", `(${inList})`);

      if (delErr) {
        console.warn(`   ⚠ Could not delete old category images for ${category.name}:`, delErr.message);
      }
    }

    // Update categories.image to first URL (backward compatibility)
    const { error: updErr } = await supabase
      .from("categories")
      .update({ image: urls[0] })
      .eq("id", category.id);

    if (updErr) {
      console.warn(`   ⚠ Could not update categories.image for ${category.name}:`, updErr.message);
    }

    totalUploaded += urls.length;
    categoriesUpdated++;
    console.log(`   ✓ ${category.name} (${slug}): ${urls.length} image(s)`);
  }

  console.log("\n══════════════════════════════════════════════════");
  console.log(`Done. ${totalUploaded} image(s) uploaded, ${categoriesUpdated} categories updated.`);
  console.log("══════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
