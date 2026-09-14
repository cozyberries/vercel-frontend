// Text ranking via the Redis Search index. Filters mirror lib/catalog/filter.ts so the
// server ranking and the browser's local filtering agree on the candidate set.
import { normalizeAgeSlug } from "./build";
import { MIN_QUERY_LENGTH, normalizeQuery, resolveAgeSizeSlugs, resolveGenderSlugs } from "./filter";
import { KEYS, type CatalogStore } from "./store";
import type { Filters } from "./types";

// Re-exported so server code can import query helpers from one place; the definitions
// live in filter.ts because the browser needs them too.
export { MIN_QUERY_LENGTH, normalizeQuery };
export const RANK_LIMIT = 100;

export function buildSearchFilter(q: string, f: Filters): Record<string, unknown> {
  const must: unknown[] = [];
  if (f.featured) must.push({ is_featured: { $eq: true } });
  if (f.category !== "all") must.push({ category_slug: { $eq: f.category } });
  if (f.gender !== "all") {
    must.push({ $or: f.gender.split(",").flatMap(resolveGenderSlugs).map((slug) => ({ gender_slug: { $eq: slug } })) });
  }
  if (f.age !== "all") {
    must.push({ $or: resolveAgeSizeSlugs(normalizeAgeSlug(f.age)).map((slug) => ({ size_slugs: { $eq: slug } })) });
  }
  if (f.size !== "all") must.push({ size_slugs: { $eq: f.size } });
  // Design is a print slug and color_slugs is indexed. Colour (base colour) is not in the index,
  // so it is applied locally by matchesFilters after the ranking comes back.
  if (f.design !== "all") must.push({ color_slugs: { $eq: f.design } });
  must.push({
    $should: [
      { name: { $smart: q }, $boost: 10 },
      { description: { $smart: q }, $boost: 3 },
      { features: { $smart: q }, $boost: 2 },
    ],
  });
  return { $must: must };
}

/** Ordered product slugs for a text query, or [] when the query is too short. */
export async function rankProducts(store: CatalogStore, search: string, f: Filters): Promise<string[]> {
  const q = normalizeQuery(search);
  if (q.length < MIN_QUERY_LENGTH) return [];
  const keys = await store.searchKeys(buildSearchFilter(q, f), RANK_LIMIT);
  return keys.filter((key) => key.startsWith(KEYS.productPrefix)).map((key) => key.slice(KEYS.productPrefix.length));
}
