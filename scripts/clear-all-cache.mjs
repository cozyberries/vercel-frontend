#!/usr/bin/env node

/**
 * Clear All Cache
 *
 * Clears all cached data from Upstash Redis, including:
 * - Product lists and individual products
 * - Categories
 * - Ratings
 * - User-specific caches (wishlist, orders, profile, addresses)
 *
 * Usage:
 *   node scripts/clear-all-cache.mjs [options]
 *
 * Options:
 *   --confirm     Required flag to confirm cache deletion
 *   --pattern     Clear only keys matching a specific pattern (e.g., "products:*")
 *   --dry-run     Show what would be deleted without actually deleting
 */

import { Redis } from "@upstash/redis";
import { config } from "dotenv";
import { resolve } from "path";

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

const DRY_RUN = process.argv.includes("--dry-run");
const CONFIRM = process.argv.includes("--confirm");
const patternArg = process.argv.find(arg => arg.startsWith("--pattern="));
const PATTERN = patternArg ? patternArg.slice(patternArg.indexOf("=") + 1) : null;

// Common cache key patterns
const CACHE_PATTERNS = [
  "products:*",           // Product list queries
  "product:*",            // Individual products
  "categories:*",         // Categories
  "ratings:*",            // Ratings
  "user:wishlist:*",      // User wishlists
  "user:orders:*",        // User orders
  "user:order:*",         // Order details
  "user:profile:*",       // User profiles
  "user:addresses:*",     // User addresses
  "rate_limit:*",         // Rate limiting (optional)
];

async function clearCacheByPattern(pattern) {
  try {
    console.log(`\n🔍 Scanning for keys matching: ${pattern}`);
    
    // Use SCAN instead of KEYS to avoid blocking
    const keys = [];
    let cursor = 0;
    const batchSize = 100;
    
    do {
      const result = await redis.scan(cursor, {
        match: pattern,
        count: batchSize
      });
      cursor = result[0];
      keys.push(...result[1]);
    } while (Number(cursor) !== 0);
    
    if (keys.length === 0) {
      console.log(`   ℹ️  No keys found matching pattern: ${pattern}`);
      return { pattern, count: 0, success: true };
    }

    console.log(`   Found ${keys.length} keys`);

    if (DRY_RUN) {
      console.log(`   [DRY RUN] Would delete ${keys.length} keys`);
      // Show first 10 keys as sample
      if (keys.length > 0) {
        console.log(`   Sample keys:`);
        keys.slice(0, 10).forEach(key => console.log(`     - ${key}`));
        if (keys.length > 10) {
          console.log(`     ... and ${keys.length - 10} more`);
        }
      }
      return { pattern, count: keys.length, success: true };
    }

    // Delete in batches using unlink (non-blocking delete)
    let deleted = 0;
    
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      await redis.unlink(...batch);
      deleted += batch.length;
      process.stdout.write(`   Deleting: ${deleted}/${keys.length}\r`);
    }
    
    console.log(`   ✓ Deleted ${deleted} keys`);
    return { pattern, count: deleted, success: true };
  } catch (error) {
    console.error(`   ❌ Error clearing pattern ${pattern}:`, error.message);
    return { pattern, count: 0, success: false, error: error.message };
  }
}

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== LIVE RUN ===");
  
  if (!CONFIRM && !DRY_RUN) {
    console.error("\n❌ Confirmation required!");
    console.error("   This will delete ALL cache data from Redis.");
    console.error("   Rerun with --confirm flag to proceed, or --dry-run to preview.\n");
    console.error("Usage:");
    console.error("  node scripts/clear-all-cache.mjs --confirm           # Clear all cache");
    console.error("  node scripts/clear-all-cache.mjs --dry-run           # Preview what would be deleted");
    console.error("  node scripts/clear-all-cache.mjs --confirm --pattern=products:*  # Clear only products cache");
    process.exit(1);
  }

  console.log("\n🗑️  Cache Clearing Tool\n");

  const patterns = PATTERN ? [PATTERN] : CACHE_PATTERNS;
  const results = [];

  console.log(`Clearing ${patterns.length} cache pattern(s)...`);
  
  for (const pattern of patterns) {
    const result = await clearCacheByPattern(pattern);
    results.push(result);
  }

  // Summary
  console.log("\n" + "═".repeat(60));
  console.log("SUMMARY");
  console.log("═".repeat(60));
  
  const totalCleared = results.reduce((sum, r) => sum + r.count, 0);
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`Total keys ${DRY_RUN ? "found" : "cleared"}: ${totalCleared}`);
  console.log(`Patterns processed: ${successful} successful, ${failed} failed`);

  if (failed > 0) {
    console.log("\nFailed patterns:");
    results.filter(r => !r.success).forEach(r => {
      console.log(`  ❌ ${r.pattern}: ${r.error}`);
    });
  }

  if (DRY_RUN) {
    console.log("\n⚠️  This was a dry run. No data was deleted.");
    console.log("   Rerun with --confirm to actually clear the cache.");
  } else {
    console.log("\n✅ Cache clearing complete!");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
