import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { fetchProduct, fetchReference, knownSlugs, saveProduct } from "@/lib/admin/products/db";
import { errorResponse, isSlugParam, jsonError, NO_STORE } from "@/lib/admin/products/http";
import { parseProductUpdate } from "@/lib/admin/products/rules";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { slug } = await params;
  if (!isSlugParam(slug)) return jsonError("Product not found", 404);
  try {
    const admin = createAdminSupabaseClient();
    const [product, reference] = await Promise.all([fetchProduct(admin, slug), fetchReference(admin)]);
    if (!product) return jsonError("Product not found", 404);
    return NextResponse.json({ product, reference }, { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e, "Couldn't load the product");
  }
}

/**
 * Saves details, size prices, stock counts and new sizes. A stock count that changed since the
 * page loaded (a sale was confirmed) is left alone and returned in `conflicts`.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { slug } = await params;
  if (!isSlugParam(slug)) return jsonError("Product not found", 404);
  try {
    const body = await request.json().catch(() => null);
    const admin = createAdminSupabaseClient();
    const [product, reference] = await Promise.all([fetchProduct(admin, slug), fetchReference(admin)]);
    if (!product) return jsonError("Product not found", 404);
    const current = new Map(product.variants.map((v) => [v.slug, v.size_slug]));
    const parsed = parseProductUpdate(body, knownSlugs(reference), current);
    if (!parsed.ok) return jsonError(parsed.error, 400);
    const result = await saveProduct(admin, product, parsed.value);
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e, "Couldn't save the product");
  }
}
