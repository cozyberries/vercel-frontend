#!/usr/bin/env node

/**
 * Generate AI-Powered Product Descriptions
 *
 * Uses OpenAI's GPT-4 Vision API to analyze product images and metadata,
 * generating meaningful, unique descriptions for each product.
 *
 * Usage:
 *   node scripts/generate-ai-descriptions.mjs [options]
 *   node scripts/generate-ai-descriptions.mjs --help
 *
 * Options:
 *   --dry-run       Print descriptions only; do not update DB
 *   --no-cache      Skip cache warming after DB update
 *   --limit=N       Process only first N products (for testing)
 *   --url=URL       Base URL for cache warm (default: localhost:3000 or VERCEL_URL)
 *   --api-key=KEY   OpenAI API key (or set OPENAI_API_KEY env var)
 *
 * Prereq: .env must contain OPENAI_API_KEY and Supabase credentials
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import https from "https";
import http from "http";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ---------------------------------------------------------------------------
// OpenAI Vision API integration
// ---------------------------------------------------------------------------

async function generateDescriptionWithVision(product, openaiApiKey) {
  const { name, price, images, category_name, stock_quantity, is_featured } = product;

  if (!images || images.length === 0) {
    throw new Error(`No images available for product: ${name}`);
  }

  const firstImageUrl = images[0];
  console.log(`  Analyzing image: ${firstImageUrl}`);

  const prompt = `You are a professional e-commerce copywriter for "Cozyberries", a premium children's clothing brand specializing in comfortable, gentle fabrics for babies and kids.

Analyze this product image carefully and write a compelling, customer-focused product description.

Product Details:
- Name: ${name}
- Category: ${category_name || "children's clothing"}
- Price: ₹${price}
${is_featured ? "- Featured product" : ""}
${stock_quantity ? `- In Stock: ${stock_quantity} units` : ""}

Requirements:
1. Write 2-3 sentences (40-60 words total)
2. Focus on what you SEE in the image: specific colors, patterns, design details, fabric appearance
3. Highlight comfort, quality, and why parents would love it
4. Use warm, trustworthy language that appeals to parents
5. DO NOT just list keywords or repeat the product name
6. Make it unique and specific to THIS product based on the visual details you observe
7. Mention the actual colors/patterns you see (e.g., "soft mint green", "playful mushroom print")

Write ONLY the description text, nothing else.`;

  const requestBody = {
    model: "gpt-4o",
    max_tokens: 150,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt,
          },
          {
            type: "image_url",
            image_url: {
              url: firstImageUrl,
              detail: "high",
            },
          },
        ],
      },
    ],
    temperature: 0.7,
  };

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(
            new Error(
              `OpenAI API error: ${res.statusCode} - ${data}`
            )
          );
          return;
        }
        try {
          const response = JSON.parse(data);
          const description = response.choices?.[0]?.message?.content?.trim();
          if (!description) {
            reject(new Error("No description in API response"));
            return;
          }
          resolve(description);
        } catch (err) {
          reject(new Error(`Failed to parse API response: ${err.message}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(45000, () => {
      req.destroy();
      reject(new Error("API request timed out"));
    });
    req.write(JSON.stringify(requestBody));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Supabase: fetch products, update descriptions
// ---------------------------------------------------------------------------

async function fetchProducts(supabase, limit = null) {
  let query = supabase
    .from("products")
    .select("id, name, slug, description, price, images, stock_quantity, is_featured, category_id, categories(name)")
    .order("name", { ascending: true });

  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch products: ${error.message}`);

  return (data || []).map((p) => ({
    ...p,
    category_name: p.categories?.name || null,
  }));
}

async function updateProductDescription(supabase, id, description) {
  const { error } = await supabase
    .from("products")
    .update({
      description,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(`Update failed for ${id}: ${error.message}`);
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
  let limit = null;
  let apiKey = process.env.OPENAI_API_KEY || null;
  let baseUrl =
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      console.log(`
Generate AI-Powered Product Descriptions

  node scripts/generate-ai-descriptions.mjs [options]

Options:
  --dry-run       Show generated descriptions only; do not update DB
  --no-cache      Do not call cache warm after updating DB
  --limit=N       Process only first N products (for testing)
  --url=URL       Base URL for cache warm (default: VERCEL_URL or http://localhost:3000)
  --api-key=KEY   OpenAI API key (INSECURE: visible in shell history; use OPENAI_API_KEY env var instead)
  -h, --help      Show this help

⚠️  WARNING: Using --api-key exposes your API key in shell history and process listings.
   It is strongly recommended to use the OPENAI_API_KEY environment variable instead.

Example:
  # Test with 3 products first
  node scripts/generate-ai-descriptions.mjs --dry-run --limit=3

  # Update all products and warm cache
  node scripts/generate-ai-descriptions.mjs
`);
      process.exit(0);
    }
    if (arg === "--dry-run") dryRun = true;
    if (arg === "--no-cache") skipCache = true;
    if (arg.startsWith("--limit=")) {
      const parsedLimit = parseInt(arg.slice("--limit=".length), 10);
      if (!Number.isFinite(parsedLimit) || !Number.isInteger(parsedLimit) || parsedLimit < 1) {
        console.error("❌ Invalid --limit value: must be a positive integer");
        process.exit(1);
      }
      limit = parsedLimit;
    }
    if (arg.startsWith("--url=")) baseUrl = arg.slice("--url=".length);
    if (arg.startsWith("--api-key=")) apiKey = arg.slice("--api-key=".length);
  }
  return { dryRun, skipCache, limit, apiKey, baseUrl };
}

async function main() {
  const { dryRun, skipCache, limit, apiKey, baseUrl } = parseArgs();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error(
      "❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env"
    );
    console.error("   SUPABASE_SERVICE_ROLE_KEY is required for database updates (anon key is insufficient)");
    process.exit(1);
  }

  if (!apiKey) {
    console.error("❌ Missing OPENAI_API_KEY. Set it in .env or use --api-key=KEY");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  console.log("📦 Fetching products from Supabase...");
  const products = await fetchProducts(supabase, limit);
  console.log(`✅ Found ${products.length} products.\n`);

  const updates = [];
  let processed = 0;
  let failed = 0;

  for (const product of products) {
    processed++;
    console.log(`[${processed}/${products.length}] ${product.name}`);

    try {
      const description = await generateDescriptionWithVision(product, apiKey);
      updates.push({ id: product.id, name: product.name, description });
      console.log(`  ✅ Generated: "${description}"\n`);

      // Rate limiting: pause between requests (OpenAI tier limits)
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (err) {
      failed++;
      console.error(`  ❌ Failed: ${err.message}\n`);
      updates.push({ id: product.id, name: product.name, description: null, error: err.message });
    }
  }

  console.log(`\n📊 Summary: ${updates.length - failed} succeeded, ${failed} failed.`);

  if (dryRun) {
    console.log("\n--- Dry run: no database updates ---");
    updates.forEach((u, i) => {
      console.log(`\n${i + 1}. ${u.name}`);
      if (u.description) {
        console.log(`   ✅ ${u.description}`);
      } else {
        console.log(`   ❌ ${u.error}`);
      }
    });
    return;
  }

  const successfulUpdates = updates.filter((u) => u.description);
  if (successfulUpdates.length === 0) {
    console.error("\n❌ No successful descriptions to update.");
    process.exit(1);
  }

  console.log(`\n💾 Updating ${successfulUpdates.length} product descriptions in Supabase...`);
  let updated = 0;
  let updateFailed = 0;
  for (const u of successfulUpdates) {
    try {
      await updateProductDescription(supabase, u.id, u.description);
      updated++;
      if (updated % 10 === 0) console.log(`  Updated ${updated}/${successfulUpdates.length}...`);
    } catch (error) {
      updateFailed++;
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ Failed to update product ${u.id} (${u.name}): ${errMsg}`);
    }
  }
  console.log(`✅ Done. Updated ${updated} products, ${updateFailed} failed.\n`);

  if (!skipCache) {
    console.log(`🔥 Warming cache at ${baseUrl}...`);
    try {
      const result = await postCacheWarm(baseUrl);
      if (result.status >= 200 && result.status < 300) {
        const msg = result.data?.message || "OK";
        const keys = result.data?.warmed ?? 0;
        console.log(`✅ Cache warm: ${result.status} – ${msg} (${keys} keys).`);
      } else {
        console.warn(`⚠️  Cache warm returned ${result.status}. Check ${baseUrl}/api/cache/warm.`);
      }
    } catch (err) {
      console.warn("⚠️  Cache warm request failed:", err.message);
      console.warn("   Run manually: node scripts/warm-cache.js [--url=<base>]");
    }
  } else {
    console.log("⏭️  Skipping cache warm (--no-cache). Run: node scripts/warm-cache.js");
  }

  console.log("\n🎉 Finished.");
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
