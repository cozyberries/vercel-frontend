import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import { UpstashService } from "@/lib/upstash";

function invalidateRatingCaches(productSlug: string): void {
  UpstashService.delete("ratings:all").catch(() => {});
  UpstashService.delete(`ratings:product:${productSlug}`).catch(() => {});
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

    if (authError || !authUser) {
      return NextResponse.json(
        { error: "Unauthorized: Please log in to submit a rating" },
        { status: 401 }
      );
    }

    const formData = await request.formData();

    const user_id = formData.get("user_id") as string | null;
    const product_slug = (formData.get("product_slug") ?? formData.get("product_id")) as string | null;
    const ratingValue = Number(formData.get("rating"));
    const comment = (formData.get("comment") as string) || "";
    const imageFiles = formData.getAll("images") as File[];

    if (user_id !== authUser.id) {
      return NextResponse.json(
        { error: "Forbidden: User ID mismatch" },
        { status: 403 }
      );
    }

    if (!Number.isFinite(ratingValue) || ratingValue < 1 || ratingValue > 5 || !Number.isInteger(ratingValue)) {
      return NextResponse.json(
        { error: "Invalid rating: Must be an integer between 1 and 5" },
        { status: 400 }
      );
    }

    if (!product_slug) {
      return NextResponse.json({ error: "Missing product_slug" }, { status: 400 });
    }

    const MAX_IMAGES = 5;
    const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
    const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];

    if (imageFiles.length > MAX_IMAGES) {
      return NextResponse.json(
        { error: `Too many images: Maximum ${MAX_IMAGES} images allowed` },
        { status: 400 }
      );
    }

    const validImages: File[] = [];
    for (const file of imageFiles) {
      if (!(file instanceof File) || file.size === 0) continue;
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `Invalid file type: ${file.type}. Allowed types: ${ALLOWED_TYPES.join(", ")}` },
          { status: 400 }
        );
      }
      if (file.size > MAX_IMAGE_SIZE) {
        return NextResponse.json(
          { error: `File too large: ${file.name} exceeds ${MAX_IMAGE_SIZE / (1024 * 1024)}MB limit` },
          { status: 400 }
        );
      }
      validImages.push(file);
    }

    const { data, error } = await supabase
      .from("ratings")
      .insert([
        {
          user_id: authUser.id,
          product_slug,
          rating: ratingValue,
          comment,
          images: [],
        },
      ])
      .select("*")
      .single();

    if (error) throw error;

    let responseData = data;

    invalidateRatingCaches(product_slug);

    if (validImages.length > 0) {
      const uploadResults = await Promise.allSettled(
        validImages.map((file) =>
          uploadImageToCloudinary(file).then((url) => ({ file: file.name, url, status: "success" }))
        )
      );

      const uploadedUrls: string[] = [];
      const uploadStatus: Array<{ file: string; status: "success" | "failed"; url?: string; reason?: string }> = [];

      for (let i = 0; i < uploadResults.length; i++) {
        const result = uploadResults[i];
        const fileName = validImages[i].name;
        if (result.status === "fulfilled") {
          uploadedUrls.push(result.value.url);
          uploadStatus.push({ file: fileName, status: "success", url: result.value.url });
        } else {
          const reason = result.reason?.message || String(result.reason);
          console.error(`Failed to upload review image ${fileName}:`, result.reason);
          uploadStatus.push({ file: fileName, status: "failed", reason });
        }
      }

      if (uploadedUrls.length > 0) {
        const { error: updateError } = await supabase
          .from("ratings")
          .update({ images: uploadedUrls })
          .eq("id", data.id)
          .eq("user_id", authUser.id)
          .eq("product_slug", product_slug);

        if (updateError) {
          console.error("Failed to update review images:", updateError);
          invalidateRatingCaches(product_slug);
          return NextResponse.json({
            success: true,
            rating: responseData,
            uploadStatus,
            warning: "Review created but failed to save image URLs to database",
          });
        } else {
          const { data: updatedData } = await supabase
            .from("ratings")
            .select("*")
            .eq("id", data.id)
            .single();
          if (updatedData) {
            responseData = { ...data, images: updatedData.images };
          }
          invalidateRatingCaches(product_slug);
        }
      }

      return NextResponse.json({ success: true, rating: responseData, uploadStatus });
    }

    return NextResponse.json({ success: true, rating: responseData });
  } catch (error: any) {
    console.error("Error submitting rating:", error);
    return NextResponse.json({ error: "Failed to submit rating" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productSlug = searchParams.get("product_slug") ?? searchParams.get("product_id");

    const cacheKey = productSlug ? `ratings:product:${productSlug}` : "ratings:all";

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

    const supabase = await createServerSupabaseClient();
    let query = supabase.from("ratings").select("*").order("created_at", { ascending: false });
    if (productSlug) {
      query = query.eq("product_slug", productSlug);
    }

    const { data, error } = await query;
    if (error) throw error;

    const payload = data ?? [];
    UpstashService.set(cacheKey, payload, 900).catch(() => {});

    return NextResponse.json(payload, {
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
