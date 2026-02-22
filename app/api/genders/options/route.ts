import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { UpstashService } from "@/lib/upstash";

export interface GenderOption {
  id: string;
  name: string;
  display_order: number;
}

type GenderOptionsCache = { data: GenderOption[]; timestamp: number } | null;

let inMemoryCache: GenderOptionsCache = null;
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

    const cacheKey = "genders:options";
    let cached: GenderOption[] | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      const cachePromise = UpstashService.get(cacheKey);
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Cache timeout")), 300);
      });
      cached = (await Promise.race([cachePromise, timeoutPromise])) as GenderOption[] | null;
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
    // Order is enforced in this route (Unisex, Girl(s), Boy(s)), not by DB display_order
    const { data, error } = await supabase
      .from("genders")
      .select("slug, name, display_order");

    if (error) {
      console.error("Failed to retrieve gender options:", error);
      return NextResponse.json(
        { error: "Failed to retrieve gender options" },
        { status: 500 }
      );
    }

    const rawOptions: GenderOption[] = (data || []).map((row) => ({
      id: String(row.slug),
      name: String(row.name),
      display_order: Number(row.display_order ?? 0),
    }));

    // Fixed display order: Unisex, Girl(s), Boy(s)
    const genderOrder = ["Unisex", "Girl", "Girls", "Boy", "Boys"];
    const options = [...rawOptions].sort((a, b) => {
      const i = genderOrder.findIndex((g) => g.toLowerCase() === a.name.toLowerCase());
      const j = genderOrder.findIndex((g) => g.toLowerCase() === b.name.toLowerCase());
      const orderA = i === -1 ? 999 : i;
      const orderB = j === -1 ? 999 : j;
      return orderA - orderB;
    });

    inMemoryCache = { data: options, timestamp: Date.now() };
    UpstashService.set(cacheKey, options, 7200).catch((err) => {
      console.error("Failed to cache gender options:", err);
    });

    return NextResponse.json(options, {
      headers: {
        "X-Cache-Status": "MISS",
        "X-Data-Source": "SUPABASE_DATABASE",
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("Unexpected error in gender options:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
