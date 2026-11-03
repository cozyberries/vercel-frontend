import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { createProduct, fetchProductList, fetchReference, knownSlugs } from "@/lib/admin/products/db";
import { errorResponse, jsonError, NO_STORE } from "@/lib/admin/products/http";
import { parseNewProduct } from "@/lib/admin/products/rules";

export const dynamic = "force-dynamic";

/** Every product for /admin/products, read live, plus the categories/sizes/prints the forms offer. */
export async function GET() {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  try {
    const admin = createAdminSupabaseClient();
    const [products, reference] = await Promise.all([fetchProductList(admin), fetchReference(admin)]);
    return NextResponse.json({ products, reference }, { headers: NO_STORE });
  } catch (e) {
    return errorResponse(e, "Couldn't load products");
  }
}

/** Creates a product with its sizes. Photos are added afterwards on its edit page. */
export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  try {
    const body = await request.json().catch(() => null);
    const admin = createAdminSupabaseClient();
    const parsed = parseNewProduct(body, knownSlugs(await fetchReference(admin)));
    if (!parsed.ok) return jsonError(parsed.error, 400);
    const slug = await createProduct(admin, parsed.value);
    return NextResponse.json({ slug }, { status: 201, headers: NO_STORE });
  } catch (e) {
    return errorResponse(e, "Couldn't add the product");
  }
}
