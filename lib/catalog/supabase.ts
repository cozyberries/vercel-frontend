// Supabase reads for the catalog rebuild and fallback paths. Uses the cookie-free public
// client only, so importing this module never opts a route into dynamic rendering.
import { createPublicSupabaseClient } from "@/lib/supabase-server";
import type { ProductRow, RatingRow, ReferenceRows } from "./types";

/** Same joins as the legacy getProductBySlug, so documents carry everything the PDP needs. */
export const PRODUCT_DOC_SELECT = `
  slug, name, description, price, care_instructions,
  stock_quantity, is_featured, created_at, updated_at,
  category_slug, gender_slug, size_slugs, color_slugs,
  categories(name, slug),
  genders(name, slug),
  product_images(url, is_primary, display_order),
  product_features(feature, display_order),
  product_variants(
    slug, price, stock_quantity, size_slug, color_slug,
    sizes(slug, name, display_order),
    colors(slug, name, hex_code, base_color)
  )
`;

const PAGE_SIZE = 100;

function client() {
  return createPublicSupabaseClient();
}

function fail(label: string, error: { message: string } | null): never {
  throw new Error(`[catalog/supabase] ${label}: ${error?.message ?? "unknown error"}`);
}

export async function fetchProductRows(slugs?: string[]): Promise<ProductRow[]> {
  const supabase = client();
  if (slugs) {
    if (slugs.length === 0) return [];
    const { data, error } = await supabase.from("products").select(PRODUCT_DOC_SELECT).in("slug", slugs);
    if (error) fail("products by slug", error);
    return (data ?? []) as unknown as ProductRow[];
  }
  const all: ProductRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_DOC_SELECT)
      .order("created_at", { ascending: false })
      .order("slug", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) fail("products page", error);
    const rows = (data ?? []) as unknown as ProductRow[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

export async function fetchAllProductSlugs(): Promise<string[]> {
  const { data, error } = await client().from("products").select("slug");
  if (error) fail("product slugs", error);
  return ((data ?? []) as Array<{ slug: string }>).map((row) => row.slug);
}

export async function fetchReferenceRows(): Promise<ReferenceRows> {
  const supabase = client();
  const [categories, genders, sizes, colors] = await Promise.all([
    supabase.from("categories").select("slug, name, description, image, display").order("name", { ascending: true }),
    supabase.from("genders").select("slug, name, display_order"),
    supabase
      .from("sizes")
      .select("slug, name, display_order")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("colors").select("slug, name, hex_code"),
  ]);
  if (categories.error) fail("categories", categories.error);
  if (genders.error) fail("genders", genders.error);
  if (sizes.error) fail("sizes", sizes.error);
  if (colors.error) fail("colors", colors.error);
  return {
    categories: (categories.data ?? []) as ReferenceRows["categories"],
    genders: (genders.data ?? []) as ReferenceRows["genders"],
    sizes: (sizes.data ?? []) as ReferenceRows["sizes"],
    colors: (colors.data ?? []) as ReferenceRows["colors"],
  };
}

export async function fetchRatingRows(slugs?: string[]): Promise<RatingRow[]> {
  if (slugs && slugs.length === 0) return [];
  let query = client().from("ratings").select("product_slug, rating");
  if (slugs) query = query.in("product_slug", slugs);
  const { data, error } = await query;
  if (error) fail("ratings", error);
  return (data ?? []) as RatingRow[];
}

/** Products are keyed by slug; an `id` column may not exist. Any error resolves to null. */
export async function resolveProductSlugById(id: string): Promise<string | null> {
  const { data, error } = await client().from("products").select("slug").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return (data as { slug?: string }).slug ?? null;
}

export const catalogDb = {
  fetchProductRows,
  fetchAllProductSlugs,
  fetchReferenceRows,
  fetchRatingRows,
  resolveProductSlugById,
};
export type CatalogDb = typeof catalogDb;
