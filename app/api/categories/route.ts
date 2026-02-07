import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { UpstashService } from "@/lib/upstash";

// In-memory cache for categories (avoids Redis round-trip on hot path)
let inMemoryCache: { data: any; timestamp: number } | null = null;
const IN_MEMORY_TTL = 60_000; // 1 minute in-memory TTL

export async function GET() {
  try {

    // 1. Check in-memory cache first (instant, no network)
    if (inMemoryCache && Date.now() - inMemoryCache.timestamp < IN_MEMORY_TTL) {
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

    if (cachedCategories) {
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

    // Process categories to add image URLs
    const categories = (data || []).map((category: any) => {
      const images = (category.categories_images || [])
        .filter((img: any) => img.storage_path) // Filter out images with null storage_path
        .map((img: any) => ({
          id: img.id,
          storage_path: img.storage_path,
          is_primary: img.is_primary,
          display_order: img.display_order,
          metadata: img.metadata,
          url: `/${img.storage_path}`, // Dynamic path from database (Next.js serves from /public at root)
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
