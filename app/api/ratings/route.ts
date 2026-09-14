import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase-server";
import { UpstashService } from "@/lib/upstash";
import { notifyNewRating } from "@/lib/services/telegram";

async function uploadImageToSupabase(file: File, ratingId: string): Promise<string> {
  const supabase = createAdminSupabaseClient();
  const dotIdx = file.name.lastIndexOf(".");
  const rawExt = dotIdx !== -1 ? file.name.slice(dotIdx + 1) : "";
  const ext = /^[a-zA-Z0-9]+$/.test(rawExt)
    ? rawExt.toLowerCase()
    : (file.type.split("/")[1] ?? "jpg");
  const path = `reviews/${ratingId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();
  const { error } = await supabase.storage
    .from("media")
    .upload(path, arrayBuffer, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data } = supabase.storage.from("media").getPublicUrl(path);
  return data.publicUrl;
}

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
    const title = ((formData.get("title") as string) || "").trim() || null;
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
          title,
          comment,
          images: [],
        },
      ])
      .select("*")
      .single();

    if (error) throw error;

    let responseData = data;
    let uploadStatus: Array<{ file: string; status: "success" | "failed"; url?: string; reason?: string }> | undefined;
    let imageUpdateWarning: string | undefined;

    if (validImages.length > 0) {
      const uploadResults = await Promise.allSettled(
        validImages.map((file) =>
          uploadImageToSupabase(file, data.id).then((url) => ({ file: file.name, url, status: "success" }))
        )
      );

      const uploadedUrls: string[] = [];
      uploadStatus = [];

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
          imageUpdateWarning = "Review created but failed to save image URLs to database";
        } else {
          const { data: updatedData } = await supabase
            .from("ratings")
            .select("*")
            .eq("id", data.id)
            .single();
          if (updatedData) {
            responseData = { ...data, images: updatedData.images };
          }
        }
      }
    }

    invalidateRatingCaches(product_slug);
    void notifyNewRating({
      productSlug: product_slug,
      rating: ratingValue,
      comment: comment || null,
      email: authUser.email ?? null,
      phone: authUser.phone ?? null,
    });
    if (uploadStatus !== undefined) {
      return NextResponse.json({
        success: true,
        rating: responseData,
        uploadStatus,
        ...(imageUpdateWarning && { warning: imageUpdateWarning }),
      });
    }
    return NextResponse.json({ success: true, rating: responseData });
  } catch (error: any) {
    console.error("Error submitting rating:", error);
    return NextResponse.json({ error: "Failed to submit rating" }, { status: 500 });
  }
}

/**
 * Strips reviewer `user_id` UUIDs out of the public ratings payload.
 *
 * The list endpoint is readable anonymously, so emitting raw auth user ids
 * handed callers a ready-made directory of valid user ids. The only consumer
 * that genuinely needs `user_id` is `/orders`, which compares it against the
 * signed-in user to decide whether they have already reviewed a product — so
 * the id is echoed back for the viewer's OWN rows and dropped for everyone
 * else. `user_name` (the display name the UI renders) is unaffected.
 */
function stripForeignUserIds<T extends Record<string, any>>(
  rows: T[],
  viewerId: string | null
): Record<string, any>[] {
  return rows.map((row) => {
    const { user_id, ...rest } = row;
    if (viewerId && user_id === viewerId) {
      return { ...rest, user_id };
    }
    return rest;
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productSlug = searchParams.get("product_slug") ?? searchParams.get("product_id");

    const cacheKey = productSlug ? `ratings:product:${productSlug}` : "ratings:all";

    const supabase = await createServerSupabaseClient();

    // Identify the viewer so we can echo back only their own user_id. The
    // response now varies per user, so it must never be shared by a CDN.
    let viewerId: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      viewerId = user?.id ?? null;
    } catch {
      viewerId = null;
    }

    // The body now varies by session (see stripForeignUserIds), so a shared
    // cache must key on the cookie. Without `Vary: Cookie` an anonymous
    // response could be replayed to a signed-in caller, stripping the
    // `user_id` that /orders uses for its "already reviewed" check.
    // `Vary` is emitted on every path, including the Redis hit, so no
    // response that can differ is ever cached under a cookie-blind key.
    const cacheControl = viewerId
      ? "private, no-store"
      : "public, s-maxage=60, stale-while-revalidate=300";
    const varyHeader = "Cookie";

    const cached = await UpstashService.get(cacheKey).catch(() => null);
    if (cached && Array.isArray(cached) && (cached.length === 0 || "user_name" in cached[0])) {
      return NextResponse.json(stripForeignUserIds(cached, viewerId), {
        status: 200,
        headers: {
          "X-Cache-Status": "HIT",
          "X-Data-Source": "REDIS_CACHE",
          "Cache-Control": cacheControl,
          Vary: varyHeader,
        },
      });
    }

    let query = supabase.from("ratings").select("*").order("created_at", { ascending: false });
    if (productSlug) {
      query = query.eq("product_slug", productSlug);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data ?? [];

    // Enrich with reviewer display names server-side so the client
    // doesn't need to call the admin-only /api/users endpoint.
    const userIds = [...new Set(rows.map((r: any) => r.user_id).filter(Boolean))] as string[];
    const userMap: Record<string, string | null> = {};
    if (userIds.length > 0) {
      try {
        const adminSupabase = createAdminSupabaseClient();
        // Fetch only the specific users who left reviews — avoids paginating all users.
        await Promise.all(userIds.map(async (id) => {
          const { data } = await adminSupabase.auth.admin.getUserById(id);
          if (data?.user) {
            userMap[id] = (data.user.user_metadata?.full_name as string) ?? null;
          }
        }));
      } catch (err) {
        console.error("[ratings GET] Failed to enrich user names:", err);
      }
    }

    const payload = rows.map((r: any) => ({ ...r, user_name: userMap[r.user_id] ?? null }));
    // The Redis copy is server-side only, so it keeps `user_id` — every read
    // path runs it back through stripForeignUserIds before it leaves the box.
    UpstashService.set(cacheKey, payload, 900).catch(() => {});

    return NextResponse.json(stripForeignUserIds(payload, viewerId), {
      status: 200,
      headers: {
        "X-Cache-Status": "MISS",
        "X-Data-Source": "SUPABASE_DATABASE",
        "Cache-Control": cacheControl,
        Vary: varyHeader,
      },
    });
  } catch (error) {
    console.error("Error fetching ratings:", error);
    return NextResponse.json({ error: "Failed to fetch ratings" }, { status: 500 });
  }
}
