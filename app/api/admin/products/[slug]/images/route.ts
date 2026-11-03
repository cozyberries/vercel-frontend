import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { appendImage, fetchProduct, setImageOrder } from "@/lib/admin/products/db";
import { errorResponse, isSlugParam, jsonError, MAX_UPLOAD_BYTES, NO_STORE } from "@/lib/admin/products/http";
import { buildPhotoFiles, photoStem, uploadPhotoFiles } from "@/lib/admin/products/photos";

export const dynamic = "force-dynamic";
// AVIF encoding of three sizes takes a few seconds.
export const maxDuration = 60;

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/** Adds one photo at the end: square master + the six variants in storage, then its product_images row. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { slug } = await params;
  if (!isSlugParam(slug)) return jsonError("Product not found", 404);
  try {
    const form = await request.formData().catch(() => null);
    const photo = form?.get("photo");
    if (!(photo instanceof Blob) || !photo.type.startsWith("image/")) return jsonError("Choose a photo", 400);
    if (photo.size > MAX_UPLOAD_BYTES) return jsonError("Photo is too large (at most 4 MB)", 413);

    const admin = createAdminSupabaseClient();
    if (!(await fetchProduct(admin, slug))) return jsonError("Product not found", 404);

    let files;
    try {
      files = await buildPhotoFiles(Buffer.from(await photo.arrayBuffer()), photoStem());
    } catch (e) {
      if ((e as Error).message === "TOO_SMALL") return jsonError("Photo is too small (at least 300 × 300 pixels)", 400);
      return jsonError("Couldn't read this photo; try a JPEG", 400);
    }
    const url = await uploadPhotoFiles(admin, slug, files);
    await appendImage(admin, slug, url);
    const product = await fetchProduct(admin, slug);
    return NextResponse.json({ product }, { status: 201, headers: NO_STORE });
  } catch (e) {
    return errorResponse(e, "Couldn't add the photo");
  }
}

/** Saves the photo order ({ urls }, first = main photo); a photo left out is removed from the product. */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { slug } = await params;
  if (!isSlugParam(slug)) return jsonError("Product not found", 404);
  try {
    const body = (await request.json().catch(() => null)) as { urls?: unknown } | null;
    const urls = body?.urls;
    if (!Array.isArray(urls) || urls.some((u) => typeof u !== "string")) return jsonError("Invalid photo list", 400);
    const admin = createAdminSupabaseClient();
    await setImageOrder(admin, slug, urls as string[]);
    const product = await fetchProduct(admin, slug);
    if (!product) return jsonError("Product not found", 404);
    return NextResponse.json({ product }, { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e, "Couldn't save the photos");
  }
}
