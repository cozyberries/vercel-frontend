// Response builders shared by the compatibility API routes. Every response comes from the
// Data Cache layer, so no route here touches Supabase or Redis directly.
import { getProduct, getRanking, getSnapshot } from "./cache";
import { DEFAULT_FILTERS, MIN_QUERY_LENGTH, applyFilters, localSearchMatch, normalizeQuery, normalizeText, paginate, parseFilters } from "./filter";
import type { CatalogSource, Snapshot } from "./types";

export const CACHE_CONTROL = {
  list: "public, s-maxage=60, stale-while-revalidate=300",
  reference: "public, s-maxage=300, stale-while-revalidate=3600",
  search: "public, s-maxage=300, stale-while-revalidate=3600",
  none: "no-store",
} as const;

export function catalogHeaders(source: CatalogSource, version: string | null, cacheControl: string, startedAt: number): Record<string, string> {
  return {
    "Cache-Control": cacheControl,
    "X-Cache-Status": source === "redis" ? "HIT" : "FALLBACK",
    "X-Catalog-Version": version ?? "none",
    "Server-Timing": `catalog;dur=${Date.now() - startedAt}`,
  };
}

export async function productsListResponse(searchParams: URLSearchParams): Promise<Response> {
  const started = Date.now();
  const limit = parseInt(searchParams.get("limit") || "100", 10);
  const page = parseInt(searchParams.get("page") || "1", 10);
  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    return Response.json({ error: "Limit must be between 1 and 100" }, { status: 400 });
  }
  if (!Number.isFinite(page) || page < 1) {
    return Response.json({ error: "Page must be greater than 0" }, { status: 400 });
  }
  const filters = parseFilters(searchParams);
  const { snapshot, source } = await getSnapshot();
  const ranking = filters.search ? await getRanking(filters.search, filters) : null;
  const body = paginate(applyFilters(snapshot.products, filters, ranking), page, limit);
  return Response.json(body, { headers: catalogHeaders(source, snapshot.version, CACHE_CONTROL.list, started) });
}

export async function productDetailResponse(slug: string): Promise<Response> {
  const started = Date.now();
  const [{ product, source }, { snapshot }] = await Promise.all([getProduct(slug), getSnapshot()]);
  if (!product) {
    return Response.json({ error: "Product not found" }, { status: 404, headers: { "Cache-Control": CACHE_CONTROL.none } });
  }
  return Response.json(product, { headers: catalogHeaders(source, snapshot.version, CACHE_CONTROL.list, started) });
}

export type OptionKind = "categories" | "ages" | "sizes" | "genders";

export function optionsFromSnapshot(kind: OptionKind, snapshot: Snapshot): unknown[] {
  const ref = snapshot.reference;
  switch (kind) {
    case "categories":
      return ref.categories.map((c) => ({ id: c.slug, name: c.name, slug: c.slug }));
    case "ages":
      return ref.sizes.map((s) => ({ id: s.slug, name: s.name, slug: s.slug, display_order: s.display_order }));
    case "sizes":
      return ref.sizes.map((s) => ({ id: s.slug, slug: s.slug, name: s.name, display_order: s.display_order }));
    case "genders":
      return ref.genders.map((g) => ({ id: g.slug, name: g.name, display_order: g.display_order }));
  }
}

export async function optionsResponse(kind: OptionKind): Promise<Response> {
  const started = Date.now();
  const { snapshot, source } = await getSnapshot();
  return Response.json(optionsFromSnapshot(kind, snapshot), { headers: catalogHeaders(source, snapshot.version, CACHE_CONTROL.reference, started) });
}

export async function categoriesResponse(): Promise<Response> {
  const started = Date.now();
  const { snapshot, source } = await getSnapshot();
  const categories = snapshot.reference.categories.map((c) => ({
    slug: c.slug,
    name: c.name,
    description: c.description,
    image: c.image,
    display: c.display,
    id: c.slug,
    images: c.image ? [{ url: c.image, is_primary: true, display_order: 0 }] : [],
  }));
  return Response.json(categories, { headers: catalogHeaders(source, snapshot.version, CACHE_CONTROL.reference, started) });
}

export async function searchResponse(searchParams: URLSearchParams): Promise<Response> {
  const started = Date.now();
  const q = normalizeQuery(searchParams.get("q") ?? "");
  const filters = parseFilters(searchParams);
  const { snapshot, source } = await getSnapshot();
  const slugs = q.length >= MIN_QUERY_LENGTH ? await getRanking(q, filters) : null;
  return Response.json({ version: snapshot.version, q, slugs }, { headers: catalogHeaders(source, snapshot.version, CACHE_CONTROL.search, started) });
}

export async function suggestionsResponse(rawQuery: string): Promise<Response> {
  const started = Date.now();
  const { snapshot, source } = await getSnapshot();
  const headers = catalogHeaders(source, snapshot.version, CACHE_CONTROL.search, started);
  const q = normalizeQuery(rawQuery);
  if (q.length < MIN_QUERY_LENGTH) return Response.json({ suggestions: [] }, { headers });

  const ranking = await getRanking(q, DEFAULT_FILTERS);
  const bySlug = new Map(snapshot.products.map((p) => [p.slug, p] as const));
  const productSlugs = ranking ?? snapshot.products.filter((p) => localSearchMatch(p, q)).map((p) => p.slug);
  const products = productSlugs
    .slice(0, 6)
    .map((slug) => bySlug.get(slug))
    .filter((p): p is NonNullable<typeof p> => p !== undefined)
    .map((p) => ({ id: `product:${p.slug}`, name: p.name, type: "product" as const, slug: p.slug, image: p.images[0], categoryName: p.categories?.name }));
  const categories = snapshot.reference.categories
    .filter((c) => normalizeText(c.name).includes(q))
    .slice(0, 3)
    .map((c) => ({ id: `category:${c.slug}`, name: c.name, type: "category" as const, slug: c.slug, image: c.image ?? undefined }));
  const genders = snapshot.reference.genders
    .filter((g) => normalizeText(g.name).startsWith(q))
    .slice(0, 2)
    .map((g) => ({ id: `gender:${g.slug}`, name: g.name, type: "gender" as const, slug: g.slug }));

  return Response.json({ suggestions: [...products, ...categories, ...genders] }, { headers });
}
