import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { UpstashService } from "@/lib/upstash";

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
}

type CategoryOptionsCache = { data: CategoryOption[]; timestamp: number } | null;

// Lightweight in-memory cache for category options (id, name, slug only)
let inMemoryCache: CategoryOptionsCache = null;
const IN_MEMORY_TTL = 120_000; // 2 minutes — options change very rarely

export async function GET() {
  try {
    // 1. Check in-memory cache first (instant)
    if (inMemoryCache && Date.now() - inMemoryCache.timestamp < IN_MEMORY_TTL) {
      return NextResponse.json(inMemoryCache.data, {
        headers: {
          "X-Cache-Status": "HIT",
          "X-Data-Source": "MEMORY_CACHE",
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
        },
      });
    }

    // 2. Try Redis cache
    const cacheKey = "categories:options";
    let cached: CategoryOption[] | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      const cachePromise = UpstashService.get(cacheKey);
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Cache timeout")), 300);
      });
      cached = (await Promise.race([cachePromise, timeoutPromise])) as CategoryOption[] | null;
    } catch {
      // Cache miss or timeout — continue to DB
    } finally {
      // Clear the timeout to prevent memory leaks if cache promise resolved first
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }

    if (cached && Array.isArray(cached)) {
      inMemoryCache = { data: cached, timestamp: Date.now() };
      return NextResponse.json(cached, {
        headers: {
          "X-Cache-Status": "HIT",
          "X-Data-Source": "REDIS_CACHE",
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
        },
      });
    }

    // 3. Query only the three fields we need
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, slug")
      .eq("display", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("Failed to retrieve category options:", error);
      return NextResponse.json(
        { error: "Failed to retrieve category options" },
        { status: 500 }
      );
    }

    const options: CategoryOption[] = (data || []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      slug: String(row.slug),
    }));

    // Update caches
    inMemoryCache = { data: options, timestamp: Date.now() };
    UpstashService.set(cacheKey, options, 7200).catch((err) => {
      console.error("Failed to cache category options:", err);
    });

    return NextResponse.json(options, {
      headers: {
        "X-Cache-Status": "MISS",
        "X-Data-Source": "SUPABASE_DATABASE",
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("Unexpected error in category options:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
