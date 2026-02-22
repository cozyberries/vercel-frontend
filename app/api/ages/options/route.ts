import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { UpstashService } from "@/lib/upstash";

export interface AgeOption {
  id: string;
  name: string;
  slug: string;
  display_order: number;
}

type AgeOptionsCache = { data: AgeOption[]; timestamp: number } | null;

let inMemoryCache: AgeOptionsCache = null;
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

    const cacheKey = "ages:options";
    let cached: AgeOption[] | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      const cachePromise = UpstashService.get(cacheKey);
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Cache timeout")), 300);
      });
      cached = (await Promise.race([cachePromise, timeoutPromise])) as AgeOption[] | null;
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
      console.error("Failed to retrieve age options:", error);
      return NextResponse.json(
        { error: "Failed to retrieve age options" },
        { status: 500 }
      );
    }

    const options: AgeOption[] = (data || []).map((row) => {
      const slug = String(row.slug ?? "").toLowerCase().trim();
      return {
        id: slug,
        name: String(row.name ?? ""),
        slug,
        display_order: Number(row.display_order ?? 0),
      };
    });

    inMemoryCache = { data: options, timestamp: Date.now() };
    UpstashService.set(cacheKey, options, 7200).catch((err) => {
      console.error("Failed to cache age options:", err);
    });

    return NextResponse.json(options, {
      headers: {
        "X-Cache-Status": "MISS",
        "X-Data-Source": "SUPABASE_DATABASE",
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("Unexpected error in age options:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
