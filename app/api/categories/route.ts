import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { UpstashService } from "@/lib/upstash";
import { resolveImageUrl } from "@/lib/utils/image";

// In-memory cache for categories (avoids Redis round-trip on hot path)
let inMemoryCache: { data: any; timestamp: number } | null = null;
const IN_MEMORY_TTL = 60_000; // 1 minute in-memory TTL

// Purge rate limit using Redis to work across serverless instances
const PURGE_RATE_LIMIT_MS = 60_000;
const PURGE_RATE_LIMIT_KEY = "purge:categories:last";

function isPurgeAuthorized(request: Request): boolean {
  const key = process.env.PURGE_API_KEY;
  if (!key?.length) return false;
  const authHeader = request.headers.get("authorization");
  const apiKey = request.headers.get("x-api-key");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : apiKey?.trim();
  return token === key;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const purge = searchParams.get("purge") === "1";

    if (purge) {
      if (!isPurgeAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      
      // Check rate limit using Redis (works across serverless instances)
      const now = Date.now();
      let lastPurgeTime = 0;
      
      try {
        const cached = await UpstashService.get(PURGE_RATE_LIMIT_KEY);
        if (cached && typeof cached === 'number') {
          lastPurgeTime = cached;
        }
        
        if (now - lastPurgeTime < PURGE_RATE_LIMIT_MS) {
          return NextResponse.json(
            { error: "Too many purge attempts", retryAfter: Math.ceil((PURGE_RATE_LIMIT_MS - (now - lastPurgeTime)) / 1000) },
            { status: 429 }
          );
        }
        
        // Update rate limit timestamp in Redis with TTL (expires after rate limit window)
        await UpstashService.set(PURGE_RATE_LIMIT_KEY, now, Math.ceil(PURGE_RATE_LIMIT_MS / 1000));
      } catch (error) {
        // Fall back to authorization-only check if Redis is unavailable
        console.warn("Redis rate limit check failed, proceeding with auth-only check:", error);
      }
      
      inMemoryCache = null;
      await UpstashService.delete("categories:list");
    }

    // 1. Check in-memory cache first (instant, no network)
    if (!purge && inMemoryCache && Date.now() - inMemoryCache.timestamp < IN_MEMORY_TTL) {
      return NextResponse.json(inMemoryCache.data, {
        headers: {
          'X-Cache-Status': 'HIT',
          'X-Cache-Key': 'categories:list',
          'X-Data-Source': 'MEMORY_CACHE',
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        }
      });
    }

    // 2. Create cache key for categories
    const cacheKey = 'categories:list';
    
    // Try to get from Redis cache with timeout
    let cachedCategories = null;
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      const cachePromise = UpstashService.get(cacheKey);
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Cache timeout')), 300);
      });
      cachedCategories = await Promise.race([cachePromise, timeoutPromise]);
    } catch (err) {
      // Cache lookup timed out or failed, skip cache
      console.warn("categories cache lookup failed (skipping cache)", { error: err });
    } finally {
      // Clear the timeout to prevent memory leaks if cache promise resolved first
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }

    if (!purge && cachedCategories) {
      // Update in-memory cache
      inMemoryCache = { data: cachedCategories, timestamp: Date.now() };
      return NextResponse.json(cachedCategories, {
        headers: {
          'X-Cache-Status': 'HIT',
          'X-Cache-Key': cacheKey,
          'X-Data-Source': 'REDIS_CACHE',
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        }
      });
    }

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("categories")
      .select(`
        *,
        categories_images(
          id,
          storage_path,
          url,
          is_primary,
          display_order,
          metadata
        )
      `)
      .eq("display", true)
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "Failed to retrieve categories", details: error.message },
        { status: 500 }
      );
    }

    // Process categories to add image URLs (use url when set; storage_path may be full URL or relative path).
    // Normalize: strip leading slash so we never return "/https://..." (invalid for img src).
    const categories = (data || []).map((category: any) => {
      const images = (category.categories_images || [])
        .filter((img: any) => img.url || img.storage_path)
        .map((img: any) => ({
          id: img.id,
          storage_path: img.storage_path,
          is_primary: img.is_primary,
          display_order: img.display_order,
          metadata: img.metadata,
          url: resolveImageUrl(img),
        }))
        .sort((a: any, b: any) => {
          // Sort by display_order only - first index is primary
          return (a.display_order || 0) - (b.display_order || 0);
        });

      return {
        ...category,
        images,
      };
    });

    
    // Update in-memory cache
    inMemoryCache = { data: categories, timestamp: Date.now() };

    // Cache the results for 1 hour (categories don't change often)
    UpstashService.set(cacheKey, categories, 3600).catch((error) => {
      console.error(`Failed to refresh cache for key ${cacheKey}:`, error);
    });
    
    return NextResponse.json(categories, {
      headers: {
        'X-Cache-Status': 'MISS',
        'X-Cache-Key': cacheKey,
        'X-Data-Source': 'SUPABASE_DATABASE',
        'X-Cache-Set': 'ASYNC',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      }
    });
  } catch (error) {
    
    // Check if it's a Supabase client creation error
    if (error instanceof Error && error.message.includes('Missing Supabase environment variables')) {
      return NextResponse.json(
        { error: "Database configuration error" },
        { status: 500 }
      );
    }
    
    // Check if it's a network/connection error
    if (error instanceof Error && (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED'))) {
      return NextResponse.json(
        { error: "Database connection failed" },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
