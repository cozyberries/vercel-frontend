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
        if (typeof img === "string" && img.startsWith("http")) {
          uploadedUrls.push(img);
        } else {
          const url = await uploadImageToCloudinary(img);
          uploadedUrls.push(url);
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
