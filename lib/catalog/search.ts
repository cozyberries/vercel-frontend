// Text ranking via the Redis Search index. Filters mirror lib/catalog/filter.ts so the
// server ranking and the browser's local filtering agree on the candidate set.
import { normalizeAgeSlug } from "./build";
import { MIN_QUERY_LENGTH, filterValues, normalizeQuery, resolveAgeSizeSlugs, resolveCategorySlugs, resolveGenderSlugs } from "./filter";
import { KEYS, type CatalogStore } from "./store";
import type { Filters } from "./types";

// Re-exported so server code can import query helpers from one place; the definitions
// live in filter.ts because the browser needs them too.
export { MIN_QUERY_LENGTH, normalizeQuery };
export const RANK_LIMIT = 100;

/** One slug → an exact match; several → any of them. */
function anyOf(field: string, slugs: string[]): Record<string, unknown> {
  return slugs.length === 1 ? { [field]: { $eq: slugs[0] } } : { $or: slugs.map((slug) => ({ [field]: { $eq: slug } })) };
}

export function buildSearchFilter(q: string, f: Filters): Record<string, unknown> {
  const must: unknown[] = [];
  if (f.featured) must.push({ is_featured: { $eq: true } });
  const categories = filterValues(f.category).flatMap(resolveCategorySlugs);
  if (categories.length > 0) must.push(anyOf("category_slug", categories));
  const genders = filterValues(f.gender).flatMap(resolveGenderSlugs);
  if (genders.length > 0) must.push({ $or: genders.map((slug) => ({ gender_slug: { $eq: slug } })) });
  const ages = filterValues(f.age).flatMap((age) => resolveAgeSizeSlugs(normalizeAgeSlug(age)));
  if (ages.length > 0) must.push({ $or: ages.map((slug) => ({ size_slugs: { $eq: slug } })) });
  const sizes = filterValues(f.size);
  if (sizes.length > 0) must.push(anyOf("size_slugs", sizes));
  // Design is a print slug and color_slugs is indexed. Colour (base colour) is not in the index,
  // so it is applied locally by matchesFilters after the ranking comes back.
  const designs = filterValues(f.design);
  if (designs.length > 0) must.push(anyOf("color_slugs", designs));
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
