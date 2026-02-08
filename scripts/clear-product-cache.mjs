#!/usr/bin/env node

/**
 * Clear product cache after category updates
 * 
 * This script clears all product-related cache entries from Redis to ensure
 * filters work correctly after category changes.
 * 
 * Usage:
 *   node scripts/clear-product-cache.mjs
 * 
 * Requires: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env
 */

import { config } from "dotenv";
import { resolve } from "path";
import { Redis } from "@upstash/redis";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!redisUrl || !redisToken) {
  console.error("❌ Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN in .env");
  process.exit(1);
}

const redis = new Redis({
  url: redisUrl,
  token: redisToken,
});

async function clearCache() {
  console.log("🧹 Clearing product cache...\n");

  try {
    // Clear all product list caches
    const productKeys = await redis.keys("products:*");
    if (productKeys.length > 0) {
      await redis.del(...productKeys);
      console.log(`✓ Cleared ${productKeys.length} product list cache entries`);
    } else {
      console.log("✓ No product list cache entries found");
    }

    // Clear individual product caches
    const individualProductKeys = await redis.keys("product:*");
    if (individualProductKeys.length > 0) {
      await redis.del(...individualProductKeys);
      console.log(`✓ Cleared ${individualProductKeys.length} individual product cache entries`);
    } else {
      console.log("✓ No individual product cache entries found");
    }

    // Clear category caches if any
    const categoryKeys = await redis.keys("categories:*");
    if (categoryKeys.length > 0) {
      await redis.del(...categoryKeys);
      console.log(`✓ Cleared ${categoryKeys.length} category cache entries`);
    } else {
      console.log("✓ No category cache entries found");
    }

    console.log("\n✅ Cache cleared successfully!");
    console.log("   The filters should now work correctly with updated categories.");
  } catch (error) {
    console.error("❌ Error clearing cache:", error);
    process.exit(1);
  }
}

clearCache();
