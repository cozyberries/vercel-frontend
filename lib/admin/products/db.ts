// Reads and writes for /admin/products. Service-role client only: every caller gates on
// requireAdmin() first and scopes each write by the product slug in the URL. Each write to
// products / product_variants / product_images / product_features fires the catalog change
// webhook, so the shop shows it in about 10 seconds.
import type { SupabaseClient } from "@supabase/supabase-js";
import { basePriceFor, productRollup, variantSlug, type KnownSlugs, type NewProductInput, type ProductUpdate } from "./rules";
import type { AdminProduct, ProductListItem, ProductReference, SaveResult } from "./types";

export class ProductError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
  }
}

const UNIQUE_VIOLATION = "23505";

function check(error: { message: string } | null, label: string) {
  if (error) throw new Error(`[admin-products] ${label}: ${error.message}`);
}

const byOrder = (a: { display_order: number | null }, b: { display_order: number | null }) => (a.display_order ?? 0) - (b.display_order ?? 0);

export async function fetchReference(admin: SupabaseClient): Promise<ProductReference> {
  const [categories, genders, sizes, colors] = await Promise.all([
    admin.from("categories").select("slug, name").order("name"),
    admin.from("genders").select("slug, name").order("display_order"),
    admin.from("sizes").select("slug, name").order("display_order"),
    admin.from("colors").select("slug, name, hex_code").order("name"),
  ]);
  for (const [label, r] of Object.entries({ categories, genders, sizes, colors })) check(r.error, label);
  return {
    categories: categories.data ?? [],
    genders: genders.data ?? [],
    sizes: sizes.data ?? [],
    colors: colors.data ?? [],
  } as ProductReference;
}

export function knownSlugs(ref: ProductReference): KnownSlugs {
  return {
    categories: new Set(ref.categories.map((c) => c.slug)),
    genders: new Set(ref.genders.map((g) => g.slug)),
    sizes: new Set(ref.sizes.map((s) => s.slug)),
    colors: new Set(ref.colors.map((c) => c.slug)),
  };
}

interface ListRow {
  slug: string;
  name: string;
  categories: { name: string } | null;
  product_images: Array<{ url: string | null; display_order: number | null }>;
  product_variants: Array<{ price: number | null; stock_quantity: number | null }>;
}

export async function fetchProductList(admin: SupabaseClient): Promise<ProductListItem[]> {
  const { data, error } = await admin
    .from("products")
    .select("slug, name, categories(name), product_images(url, display_order), product_variants(price, stock_quantity)")
    .order("name");
  check(error, "product list");
  return ((data ?? []) as unknown as ListRow[]).map((row) => {
    const images = [...row.product_images].sort(byOrder).filter((i) => i.url);
    const rollup = productRollup(row.product_variants);
    return {
      slug: row.slug,
      name: row.name,
      category_name: row.categories?.name ?? null,
      image: images[0]?.url ?? null,
      price: rollup.price,
      stock: rollup.stock_quantity,
      sizes: row.product_variants.length,
      photos: images.length,
    };
  });
}

interface ProductRow {
  slug: string;
  name: string;
  description: string | null;
  care_instructions: string | null;
  category_slug: string | null;
  gender_slug: string | null;
  product_images: Array<{ url: string | null; display_order: number | null }>;
  product_features: Array<{ feature: string; display_order: number | null }>;
  product_variants: Array<{
    slug: string;
    price: number | null;
    stock_quantity: number | null;
    size_slug: string | null;
    color_slug: string | null;
    sizes: { name: string; display_order: number | null } | null;
    colors: { name: string } | null;
  }>;
}

const PRODUCT_SELECT = `slug, name, description, care_instructions, category_slug, gender_slug,
  product_images(url, display_order),
  product_features(feature, display_order),
  product_variants(slug, price, stock_quantity, size_slug, color_slug, sizes(name, display_order), colors(name))`;

export async function fetchProduct(admin: SupabaseClient, slug: string): Promise<AdminProduct | null> {
  const { data, error } = await admin.from("products").select(PRODUCT_SELECT).eq("slug", slug).maybeSingle();
  check(error, "product");
  if (!data) return null;
  const row = data as unknown as ProductRow;
  const variants = [...row.product_variants].sort((a, b) => (a.sizes?.display_order ?? 99) - (b.sizes?.display_order ?? 99));
  return {
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    care_instructions: row.care_instructions ?? "",
    category_slug: row.category_slug,
    gender_slug: row.gender_slug,
    color_slug: variants[0]?.color_slug ?? null,
    color_name: variants[0]?.colors?.name ?? null,
    features: [...row.product_features].sort(byOrder).map((f) => f.feature),
    images: [...row.product_images].sort(byOrder).flatMap((i) => (i.url ? [i.url] : [])),
    variants: variants.map((v) => ({
      slug: v.slug,
      size_slug: v.size_slug ?? "",
      size_name: v.sizes?.name ?? v.size_slug ?? "",
      price: Number(v.price ?? 0),
      stock_quantity: Number(v.stock_quantity ?? 0),
    })),
  };
}

/**
 * Rewrites a product's rows keyed (product_slug, display_order) to `rows` in order: upsert by
 * position, then drop the positions past the end. One statement each, so the product is never
 * left with no rows while it runs (same approach as product-photography's upload.mjs --replace).
 */
async function writeByPosition(admin: SupabaseClient, table: "product_images" | "product_features", slug: string, rows: Array<Record<string, unknown>>) {
  if (rows.length) {
    const { error } = await admin
      .from(table)
      .upsert(rows.map((r, i) => ({ ...r, product_slug: slug, display_order: i + 1 })), { onConflict: "product_slug,display_order" });
    check(error, `${table} upsert`);
  }
  const { error } = await admin.from(table).delete().eq("product_slug", slug).gt("display_order", rows.length);
  check(error, `${table} trim`);
}

/** Re-reads the sizes and writes the product row's cheapest price and total stock. */
async function syncRollup(admin: SupabaseClient, slug: string) {
  const { data, error } = await admin.from("product_variants").select("price, stock_quantity").eq("product_slug", slug);
  check(error, "variants for rollup");
  const rollup = productRollup(data ?? []);
  const update = await admin
    .from("products")
    .update({ ...rollup, updated_at: new Date().toISOString() })
    .eq("slug", slug);
  check(update.error, "product rollup");
}

export async function saveProduct(admin: SupabaseClient, product: AdminProduct, update: ProductUpdate): Promise<SaveResult> {
  const slug = product.slug;
  const now = new Date().toISOString();
  const conflicts: SaveResult["conflicts"] = [];

  if (update.details) {
    const { features, ...details } = update.details;
    const { error } = await admin.from("products").update({ ...details, updated_at: now }).eq("slug", slug);
    check(error, "product details");
    await writeByPosition(admin, "product_features", slug, features.map((feature) => ({ feature })));
  }

  for (const change of update.variants) {
    const variant = product.variants.find((v) => v.slug === change.slug)!;
    if (change.price !== undefined) {
      const { error } = await admin
        .from("product_variants")
        .update({ price: change.price, base_price: basePriceFor(change.price), updated_at: now })
        .eq("slug", change.slug)
        .eq("product_slug", slug);
      check(error, "variant price");
    }
    if (change.stock) {
      // Compare-and-set: a ✅'d sale (or another phone) may have moved this count since the page loaded.
      const { data, error } = await admin
        .from("product_variants")
        .update({ stock_quantity: change.stock.to, updated_at: now })
        .eq("slug", change.slug)
        .eq("product_slug", slug)
        .eq("stock_quantity", change.stock.from)
        .select("slug");
      check(error, "variant stock");
      if (!data?.length) conflicts.push({ size_name: variant.size_name, stock_now: NaN });
    }
  }

  if (update.add_sizes.length) {
    if (!product.color_slug) throw new ProductError("This product has no print set, so sizes can't be added here", 400);
    const rows = update.add_sizes.map((s) => ({
      slug: variantSlug(slug, s.size_slug, product.color_slug!),
      product_slug: slug,
      size_slug: s.size_slug,
      color_slug: product.color_slug,
      price: s.price,
      base_price: basePriceFor(s.price),
      stock_quantity: s.stock,
    }));
    const { error } = await admin.from("product_variants").insert(rows);
    if ((error as { code?: string } | null)?.code === UNIQUE_VIOLATION) throw new ProductError("That size already exists; reload the page", 409);
    check(error, "add sizes");
  }

  if (update.variants.length || update.add_sizes.length) await syncRollup(admin, slug);

  const fresh = await fetchProduct(admin, slug);
  if (!fresh) throw new ProductError("Product not found", 404);
  for (const c of conflicts) c.stock_now = fresh.variants.find((v) => v.size_name === c.size_name)?.stock_quantity ?? 0;
  return { product: fresh, conflicts };
}

export async function createProduct(admin: SupabaseClient, input: NewProductInput): Promise<string> {
  const { slug, color_slug, sizes, features, ...details } = input;
  const variants = sizes.map((s) => ({
    slug: variantSlug(slug, s.size_slug, color_slug),
    product_slug: slug,
    size_slug: s.size_slug,
    color_slug,
    price: s.price,
    base_price: basePriceFor(s.price),
    stock_quantity: s.stock,
  }));
  const rollup = productRollup(variants);

  const { error } = await admin.from("products").insert({ slug, ...details, ...rollup });
  if ((error as { code?: string } | null)?.code === UNIQUE_VIOLATION) {
    throw new ProductError("A product with this web address already exists", 409);
  }
  check(error, "insert product");

  const inserted = await admin.from("product_variants").insert(variants);
  if (inserted.error) {
    // Compensate so a product with no sizes never reaches the shop; variants cascade with it.
    const rollback = await admin.from("products").delete().eq("slug", slug);
    if (rollback.error) console.error("[admin-products] rollback of", slug, "failed:", rollback.error);
    if ((inserted.error as { code?: string }).code === UNIQUE_VIOLATION) throw new ProductError("One of these sizes already exists", 409);
    check(inserted.error, "insert sizes");
  }

  await writeByPosition(admin, "product_features", slug, features.map((feature) => ({ feature })));
  return slug;
}

/** Saves the photo order (first = main photo). Only URLs the product already has; a missing one is removed. */
export async function setImageOrder(admin: SupabaseClient, slug: string, urls: string[]): Promise<void> {
  const { data, error } = await admin.from("product_images").select("url").eq("product_slug", slug);
  check(error, "images");
  const current = new Set((data ?? []).map((r) => r.url as string));
  if (new Set(urls).size !== urls.length || urls.some((u) => !current.has(u))) {
    throw new ProductError("The photos changed since this page loaded; reload and try again", 409);
  }
  await writeByPosition(admin, "product_images", slug, urls.map((url, i) => ({ url, is_primary: i === 0 })));
}

/** Appends one photo row after the last one. Two uploads racing for a position retry on the next. */
export async function appendImage(admin: SupabaseClient, slug: string, url: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await admin
      .from("product_images")
      .select("display_order")
      .eq("product_slug", slug)
      .order("display_order", { ascending: false })
      .limit(1);
    check(error, "last image");
    const next = Number(data?.[0]?.display_order ?? 0) + 1;
    const insert = await admin.from("product_images").insert({ product_slug: slug, url, display_order: next, is_primary: next === 1 });
    if ((insert.error as { code?: string } | null)?.code === UNIQUE_VIOLATION) continue;
    check(insert.error, "insert image");
    return;
  }
  throw new ProductError("Another photo was being added at the same time; try again", 409);
}
