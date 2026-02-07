#!/usr/bin/env node

/**
 * Generate Product Descriptions
 *
 * Generates customer-friendly product descriptions for all products in Supabase,
 * updates the database, and optionally warms the cache.
 *
 * Usage:
 *   node scripts/generate-product-descriptions.mjs [options]
 *   node scripts/generate-product-descriptions.mjs --help
 *
 * Options:
 *   --dry-run       Print descriptions only; do not update DB
 *   --no-cache      Skip cache warming after DB update
 *   --url=URL       Base URL for cache warm (default: localhost:3000 or VERCEL_URL)
 *
 * Prereq: .env must contain NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *         (or NEXT_PUBLIC_SUPABASE_URL and SUPABASE_ANON_KEY with sufficient access).
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import https from "https";
import http from "http";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

// ---------------------------------------------------------------------------
// Description generator: builds friendly e-commerce copy from name + category
// ---------------------------------------------------------------------------

const PRINT_PHRASES = {
  "soft pear": "our beloved Soft Pear print",
  "petal pops": "the sweet Petal Pops design",
  "mushie mini": "the adorable Mushie Mini print",
  "pine cone": "the charming Pine Cone pattern",
  "lilac blossom": "the delicate Lilac Blossom design",
  "joyful orbs": "the playful Joyful Orbs print",
  "moons and stars": "the dreamy Moons and Stars pattern",
  "popsicles": "the fun Popsicles design",
  "rocket rangers": "the adventurous Rocket Rangers print",
  "naughty nuts": "the cheerful Naughty Nuts pattern",
  "aloe green": "a soothing Aloe Green shade",
  "peach": "a soft Peach tone",
  "pastel pink": "a gentle Pastel Pink hue",
};

function getPrintPhrase(name) {
  const lower = name.toLowerCase();
  for (const [key, phrase] of Object.entries(PRINT_PHRASES)) {
    if (lower.includes(key)) return phrase;
  }
  return "our exclusive design";
}

function getStyleHint(name) {
  const lower = name.toLowerCase();
  if (lower.includes("chinese collar")) return "elegant Chinese collar";
  if (lower.includes("half sleeve")) return "comfortable half-sleeve style";
  if (lower.includes("layered")) return "layered top";
  if (lower.includes("ruffle")) return "pretty ruffle detail";
  if (lower.includes("butterfly sleeve")) return "flowing butterfly sleeves";
  if (lower.includes("japanese")) return "Japanese-inspired cut";
  if (lower.includes("modern")) return "modern, relaxed fit";
  if (lower.includes("sleeveless")) return "sleeveless style";
  if (lower.includes("classic")) return "classic, timeless cut";
  if (lower.includes("ribbed")) return "soft ribbed fabric";
  if (lower.includes("loose fit")) return "comfortable loose fit";
  return null;
}

function generateDescription(product) {
  const { name, category_name, price } = product;
  const category = (category_name || "outfit").toLowerCase();
  const printPhrase = getPrintPhrase(name);
  const styleHint = getStyleHint(name);
  const priceNum = parseFloat(price);
  const priceNote =
    priceNum <= 300
      ? "Great value for everyday wear."
      : "Crafted with care for lasting comfort.";

  const article = styleHint && /^[aeiou]/i.test(styleHint) ? "an" : "a";
  const intro =
    styleHint && category !== "new born essential kits"
      ? `This ${category} features ${article} ${styleHint} and ${printPhrase}. `
      : `This ${category} features ${printPhrase}. `;

  const middle =
    category === "new born essential kits"
      ? "Everything your little one needs in one beautiful set. "
      : "Made from gentle, breathable fabric ideal for sensitive skin. ";

  const close = `${priceNote} Perfect for gifting or everyday moments.`;

  return (intro + middle + close).replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Supabase: fetch products, update descriptions
// ---------------------------------------------------------------------------

async function fetchProducts(supabase) {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, slug, description, price, category_id, categories(name)")
    .order("name", { ascending: true });

  if (error) throw new Error(`Failed to fetch products: ${error.message}`);
  return (data || []).map((p) => ({
    ...p,
    category_name: p.categories?.name || null,
  }));
}

const BATCH_SIZE = 100;

async function updateProductDescriptionsBatch(supabase, rows) {
  if (rows.length === 0) return;
  const now = new Date().toISOString();
  const payload = rows.map(({ id, description }) => ({
    id,
    description,
    updated_at: now,
  }));
  const { error } = await supabase
    .from("products")
    .upsert(payload, { onConflict: "id" });

  if (error) throw new Error(`Batch update failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Cache warm: POST to /api/cache/warm
// ---------------------------------------------------------------------------

function postCacheWarm(baseUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL("/api/cache/warm", baseUrl);
    const protocol = url.protocol === "https:" ? https : http;
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname,
      method: "POST",
      headers: { "Content-Type": "application/json" },
    };

    const req = protocol.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve({
            status: res.statusCode,
            data: body ? JSON.parse(body) : null,
          });
        } catch {
          resolve({ status: res.statusCode, data: null });
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error("Cache warm request timed out"));
    });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  let dryRun = false;
  let skipCache = false;
  let baseUrl =
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      console.log(`
Generate Product Descriptions

  node scripts/generate-product-descriptions.mjs [options]

Options:
  --dry-run       Show generated descriptions only; do not update DB
  --no-cache      Do not call cache warm after updating DB
  --url=URL       Base URL for cache warm (default: VERCEL_URL or http://localhost:3000)
  -h, --help      Show this help
`);
      process.exit(0);
    }
    if (arg === "--dry-run") dryRun = true;
    if (arg === "--no-cache") skipCache = true;
    if (arg.startsWith("--url=")) baseUrl = arg.slice("--url=".length);
  }
  return { dryRun, skipCache, baseUrl };
}

async function main() {
  const { dryRun, skipCache, baseUrl } = parseArgs();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY in .env"
    );
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  console.log("Fetching products...");
  const products = await fetchProducts(supabase);
  console.log(`Found ${products.length} products.\n`);

  const updates = products.map((p) => ({
    id: p.id,
    name: p.name,
    description: generateDescription(p),
  }));

  if (dryRun) {
    console.log("--- Dry run: generated descriptions (no DB update) ---\n");
    updates.forEach((u, i) => {
      console.log(`${i + 1}. ${u.name}`);
      console.log(`   ${u.description}\n`);
    });
    return;
  }

  console.log("Updating product descriptions in Supabase (batched)...");
  let updated = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const chunk = updates.slice(i, i + BATCH_SIZE);
    await updateProductDescriptionsBatch(supabase, chunk);
    updated += chunk.length;
    if (updated % 10 === 0 || updated === updates.length) {
      console.log(`  Updated ${updated}/${updates.length}...`);
    }
  }
  console.log(`Done. Updated ${updated} products.\n`);

  if (!skipCache) {
    console.log(`Warming cache at ${baseUrl}...`);
    try {
      const result = await postCacheWarm(baseUrl);
      if (result.status >= 200 && result.status < 300) {
        const msg = result.data?.message || "OK";
        const keys = result.data?.warmed ?? 0;
        console.log(`Cache warm: ${result.status} – ${msg} (${keys} keys).`);
      } else {
        console.warn(`Cache warm returned ${result.status}. Check ${baseUrl}/api/cache/warm.`);
      }
    } catch (err) {
      console.warn("Cache warm request failed:", err.message);
      console.warn("Run manually: node scripts/warm-cache.js [--url=<base>]");
    }
  } else {
    console.log("Skipping cache warm (--no-cache). Run: node scripts/warm-cache.js");
  }

  console.log("\nFinished.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
