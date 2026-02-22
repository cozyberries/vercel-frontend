import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { UpstashService } from "@/lib/upstash";
import { setAgeSlugsCache } from "@/lib/age-slug-sizes";

export interface SizeOption {
  id: string;
  slug: string;
  name: string;
  display_order: number;
}

type SizeOptionsCache = { data: SizeOption[]; timestamp: number } | null;

// In-memory cache is only valid within a single instance/process and does not persist
// across serverless cold starts. Redis (Upstash) remains the primary cache layer;
// this is only an optimization for burst traffic on the same instance.
let inMemoryCache: SizeOptionsCache = null;
const IN_MEMORY_TTL = 120_000; // 2 minutes

export async function GET() {
  try {
    if (inMemoryCache && Date.now() - inMemoryCache.timestamp < IN_MEMORY_TTL) {
      return NextResponse.json(inMemoryCache.data, {
        headers: {
          "X-Cache-Status": "HIT",
          "X-Data-Source": "MEMORY_CACHE",
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
        },
      });
    }

    const cacheKey = "sizes:options";
    let cached: SizeOption[] | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      const cachePromise = UpstashService.get(cacheKey);
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Cache timeout")), 300);
      });
      cached = (await Promise.race([cachePromise, timeoutPromise])) as SizeOption[] | null;
    } catch {
      // continue to DB
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
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

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("sizes")
      .select("slug, name, display_order")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error("Failed to retrieve size options:", error);
      return NextResponse.json(
        { error: "Failed to retrieve size options" },
        { status: 500 }
      );
    }

    const options: SizeOption[] = (data || []).flatMap((row) => {
      const slug = String(row.slug ?? "").toLowerCase().trim();
      if (slug === "") return [];
      return [
        {
          id: slug,
          slug,
          name: String(row.name ?? ""),
          display_order: Number(row.display_order ?? 0),
        },
      ];
    });

    // Cache available size slugs (used for age filter; no age_slug)
    const slugSet = new Set(options.map((o) => o.slug).filter(Boolean));
    setAgeSlugsCache(Array.from(slugSet));

    inMemoryCache = { data: options, timestamp: Date.now() };
    UpstashService.set(cacheKey, options, 7200).catch((err) => {
      console.error("Failed to cache size options:", err);
    });

    return NextResponse.json(options, {
      headers: {
        "X-Cache-Status": "MISS",
        "X-Data-Source": "SUPABASE_DATABASE",
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("Unexpected error in size options:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
