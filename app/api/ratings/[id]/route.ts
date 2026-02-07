import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { UpstashService } from "@/lib/upstash";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cacheKey = `ratings:${id}`;

    // 1. Try Redis cache
    const cached = await UpstashService.get(cacheKey).catch(() => null);
    if (cached) {
      return NextResponse.json(cached, {
        status: 200,
        headers: {
          "X-Cache-Status": "HIT",
          "X-Data-Source": "REDIS_CACHE",
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      });
    }

    // 2. Fetch single rating by ID from DB
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("ratings")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { error: "Rating not found" },
        { status: 404 }
      );
    }

    // 3. Cache in Redis for 15 minutes
    UpstashService.set(cacheKey, data, 900).catch(() => {});

    return NextResponse.json(data, {
      status: 200,
      headers: {
        "X-Cache-Status": "MISS",
        "X-Data-Source": "SUPABASE_DATABASE",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Error fetching rating:", error);
    return NextResponse.json(
      { error: "Failed to fetch rating" },
      { status: 500 }
    );
  }
}
