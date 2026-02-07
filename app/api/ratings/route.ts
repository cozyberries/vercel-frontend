import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import { UpstashService } from "@/lib/upstash";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const body = await request.json();

    const { user_id, product_id, rating, comment, images } = body;

    if (!user_id || !product_id || !rating) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const uploadedUrls: string[] = [];
    if (images?.length > 0) {
      for (const img of images) {
        // If it's already a URL (starts with http/https), use it directly
        if (typeof img === "string" && (img.startsWith("http://") || img.startsWith("https://"))) {
          uploadedUrls.push(img);
        } 
        // If it's a File object, upload it to Cloudinary
        else if (img instanceof File) {
          const url = await uploadImageToCloudinary(img);
          uploadedUrls.push(url);
        }
        // Skip invalid image formats (non-URL strings that aren't Files)
        else {
          console.warn("Skipping invalid image format:", typeof img);
        }
      }
    }
    const { data, error } = await supabase
      .from("ratings")
      .insert([
        {
          user_id,
          product_id,
          rating,
          comment,
          images: uploadedUrls,
        },
      ])
      .select("*")
      .single();

    if (error) throw error;

    // Invalidate ratings caches so next read picks up the new review
    UpstashService.delete("ratings:all").catch(() => {});
    UpstashService.delete(`ratings:product:${product_id}`).catch(() => {});

    return NextResponse.json({ success: true, rating: data });
  } catch (error: any) {
    console.error("Error submitting rating:", error);
    return NextResponse.json({ error: "Failed to submit rating" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("product_id");

    // Build a cache key specific to the product (or all ratings)
    const cacheKey = productId ? `ratings:product:${productId}` : "ratings:all";

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

    // 2. Fetch from DB
    const supabase = await createServerSupabaseClient();
    let query = supabase.from("ratings").select("*").order("created_at", { ascending: false });
    if (productId) {
      query = query.eq("product_id", productId);
    }

    const { data, error } = await query;
    if (error) throw error;

    // 3. Cache in Redis for 15 minutes
    UpstashService.set(cacheKey, data || [], 900).catch(() => {});

    return NextResponse.json(data, {
      status: 200,
      headers: {
        "X-Cache-Status": "MISS",
        "X-Data-Source": "SUPABASE_DATABASE",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Error fetching ratings:", error);
    return NextResponse.json({ error: "Failed to fetch ratings" }, { status: 500 });
  }
}
