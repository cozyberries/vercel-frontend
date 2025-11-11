import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { uploadImageToCloudinary } from "@/lib/cloudinary";

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

    return NextResponse.json({ success: true, rating: data });
  } catch (error: any) {
    console.error("Error submitting rating:", error);
    return NextResponse.json({ error: "Failed to submit rating" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // Extract query param from the URL
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("product_id");

    let query = supabase.from("ratings").select("*").order("created_at", { ascending: false });
    if (productId) {
      query = query.eq("product_id", productId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("Error fetching ratings:", error);
    return NextResponse.json({ error: "Failed to fetch ratings" }, { status: 500 });
  }
}
