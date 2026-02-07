import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import { UpstashService } from "@/lib/upstash";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Authenticate the request
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !authUser) {
      return NextResponse.json(
        { error: "Unauthorized: Please log in to submit a rating" },
        { status: 401 }
      );
    }

    const formData = await request.formData();

    const user_id = formData.get("user_id") as string | null;
    const product_id = formData.get("product_id") as string | null;
    const ratingValue = Number(formData.get("rating"));
    const comment = (formData.get("comment") as string) || "";
    const imageFiles = formData.getAll("images") as File[];

    // Validate user_id matches authenticated user
    if (user_id !== authUser.id) {
      return NextResponse.json(
        { error: "Forbidden: User ID mismatch" },
        { status: 403 }
      );
    }

    // Validate rating is a valid number within bounds (1-5)
    if (!Number.isFinite(ratingValue) || ratingValue < 1 || ratingValue > 5 || !Number.isInteger(ratingValue)) {
      return NextResponse.json(
        { error: "Invalid rating: Must be an integer between 1 and 5" },
        { status: 400 }
      );
    }

    if (!product_id) {
      return NextResponse.json({ error: "Missing product_id" }, { status: 400 });
    }

    // Validate and limit image uploads
    const MAX_IMAGES = 5;
    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
    const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];

    if (imageFiles.length > MAX_IMAGES) {
      return NextResponse.json(
        { error: `Too many images: Maximum ${MAX_IMAGES} images allowed` },
        { status: 400 }
      );
    }

    // Validate each image
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

    // First insert the review without images
    const { data, error } = await supabase
      .from("ratings")
      .insert([
        {
          user_id: authUser.id, // Use authenticated user ID
          product_id,
          rating: ratingValue,
          comment,
          images: [],
        },
      ])
      .select("*")
      .single();

    if (error) throw error;

    // Invalidate ratings caches so next read picks up the new review
    UpstashService.delete("ratings:all").catch(() => {});
    UpstashService.delete(`ratings:product:${product_id}`).catch(() => {});

    // Upload images to Cloudinary in parallel after the review is saved
    if (validImages.length > 0) {
      const uploadResults = await Promise.allSettled(
        validImages.map((file) => 
          uploadImageToCloudinary(file).then(url => ({ file: file.name, url, status: 'success' }))
        )
      );
      
      const uploadedUrls: string[] = [];
      const uploadStatus: Array<{ file: string; status: 'success' | 'failed'; url?: string; reason?: string }> = [];
      
      for (let i = 0; i < uploadResults.length; i++) {
        const result = uploadResults[i];
        const fileName = validImages[i].name;
        
        if (result.status === "fulfilled") {
          uploadedUrls.push(result.value.url);
          uploadStatus.push({ file: fileName, status: 'success', url: result.value.url });
        } else {
          const reason = result.reason?.message || String(result.reason);
          console.error(`Failed to upload review image ${fileName}:`, result.reason);
          uploadStatus.push({ file: fileName, status: 'failed', reason });
        }
      }

      // Update the review with the uploaded image URLs
      if (uploadedUrls.length > 0) {
        const { error: updateError } = await supabase
          .from("ratings")
          .update({ images: uploadedUrls })
          .eq("id", data.id);

        if (updateError) {
          console.error("Failed to update review images:", updateError);
          
          // Re-invalidate cache even on update failure
          UpstashService.delete("ratings:all").catch(() => {});
          UpstashService.delete(`ratings:product:${product_id}`).catch(() => {});
          
          // Return with partial success info
          return NextResponse.json({ 
            success: true, 
            rating: data,
            uploadStatus,
            warning: "Review created but failed to save image URLs to database"
          });
        } else {
          // Fetch the updated rating to get the latest state
          const { data: updatedData } = await supabase
            .from("ratings")
            .select("*")
            .eq("id", data.id)
            .single();
          
          if (updatedData) {
            data.images = updatedData.images;
          }
        }

        // Re-invalidate cache after images are added
        UpstashService.delete("ratings:all").catch(() => {});
        UpstashService.delete(`ratings:product:${product_id}`).catch(() => {});
      }
      
      return NextResponse.json({ 
        success: true, 
        rating: data,
        uploadStatus
      });
    }

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
