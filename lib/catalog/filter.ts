// Pure filter/sort/paginate engine. Client-safe: no node or Next imports.
// Semantics mirror app/api/products/route.ts so the URL contract does not change.
import type { Filters, ListCard, ProductListResponse, SortBy, SortOrder } from "./types";

export const DEFAULT_FILTERS: Filters = {
  category: "all",
  gender: "all",
  size: "all",
  age: "all",
  search: "",
  sortBy: "default",
  sortOrder: "desc",
  featured: false,
};

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function read(src: ParamSource, key: string): string | null {
  if (src instanceof URLSearchParams) return src.get(key);
  const value = src[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizeOption(value: string | null): string {
  const slug = (value ?? "").trim().toLowerCase();
  return slug === "" ? "all" : slug;
}

export function parseFilters(src: ParamSource): Filters {
  const sortByRaw = read(src, "sortBy");
  const sortBy: SortBy = sortByRaw === "price" || sortByRaw === "name" ? sortByRaw : "default";
  const sortOrder: SortOrder = read(src, "sortOrder") === "asc" ? "asc" : "desc";
  return {
    category: normalizeOption(read(src, "category")),
    gender: normalizeOption(read(src, "gender")),
    size: normalizeOption(read(src, "size")),
    age: normalizeOption(read(src, "age")),
    search: (read(src, "search") ?? "").trim(),
    sortBy,
    sortOrder,
    featured: read(src, "featured") === "true",
  };
}

/** Boy/Boys → boy + unisex, Girl/Girls → girl + unisex, unisex → unisex, anything else → itself. */
export function resolveGenderSlugs(gender: string): string[] {
  const normalized = gender.trim().toLowerCase();
  if (/^boy(s)?$/.test(normalized)) return ["boy", "unisex"];
  if (/^girl(s)?$/.test(normalized)) return ["girl", "unisex"];
  if (normalized === "unisex") return ["unisex"];
  return [normalized];
}

/** "3-6y" (or the legacy "3-6-years") spans three sizes; any other age is its own size slug. */
export function resolveAgeSizeSlugs(age: string): string[] {
  const normalized = age.trim().toLowerCase();
  if (normalized === "3-6y" || normalized === "3-6-years") return ["3-4y", "4-5y", "5-6y"];
  return [normalized];
}

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function localSearchMatch(card: ListCard, search: string): boolean {
  const needle = normalizeText(search);
  if (needle === "") return true;
  const haystack = normalizeText(
    [card.name, card.description, card.categories?.name ?? "", card.genders?.name ?? "", card.category_slug, ...card.color_slugs].join(" "),
  );
  return haystack.includes(needle);
}

export function matchesFilters(card: ListCard, f: Filters): boolean {
  if (f.featured && !card.is_featured) return false;
  if (f.category !== "all" && card.category_slug !== f.category) return false;
  if (f.gender !== "all") {
    const wanted = f.gender.split(",").flatMap(resolveGenderSlugs);
    if (!wanted.includes(card.gender_slug)) return false;
  }
  if (f.age !== "all") {
    const sizes = resolveAgeSizeSlugs(f.age);
    if (!sizes.some((s) => card.size_slugs.includes(s))) return false;
  }
  if (f.size !== "all" && !card.size_slugs.includes(f.size)) return false;
  return true;
}

export function sortCards(cards: ListCard[], sortBy: SortBy, sortOrder: SortOrder): ListCard[] {
  const direction = sortOrder === "asc" ? 1 : -1;
  return [...cards].sort((a, b) => {
    if (sortBy === "price") return (a.price - b.price) * direction || a.slug.localeCompare(b.slug);
    if (sortBy === "name") return a.name.localeCompare(b.name) * direction || a.slug.localeCompare(b.slug);
    return b.created_at.localeCompare(a.created_at) || a.slug.localeCompare(b.slug);
  });
}

/**
 * Filter, search and sort. When `ranking` (ordered slugs from Redis Search) is given,
 * cards missing from it are dropped and, for the default sort, ranking order wins.
 */
export function applyFilters(cards: ListCard[], f: Filters, ranking?: string[] | null): ListCard[] {
  let result = cards.filter((card) => matchesFilters(card, f));
  if (f.search !== "") {
    if (ranking) {
      const position = new Map(ranking.map((slug, index) => [slug, index] as const));
      result = result.filter((card) => position.has(card.slug));
      if (f.sortBy === "default") {
        return result.sort((a, b) => (position.get(a.slug) ?? 0) - (position.get(b.slug) ?? 0));
      }
    } else {
      result = result.filter((card) => localSearchMatch(card, f.search));
    }
  }
  return sortCards(result, f.sortBy, f.sortOrder);
}

export function paginate(cards: ListCard[], page: number, limit: number): ProductListResponse {
  const totalItems = cards.length;
  const totalPages = Math.ceil(totalItems / limit);
  const start = (page - 1) * limit;
  return {
    products: cards.slice(start, start + limit),
    pagination: {
      currentPage: page,
      totalPages,
      totalItems,
      itemsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}

/** Shortest text query that reaches Redis Search; shorter input is matched locally only. */
export const MIN_QUERY_LENGTH = 2;

/** Canonical form of a search string for cache keys and Redis Search: lowercased, single spaces, ≤80 chars. */
export function normalizeQuery(search: string): string {
  return normalizeText(search).slice(0, 80);
}

/** Key for anything that depends on the full filter set (including sort). */
export function filtersKey(f: Filters): string {
  return [f.category, f.gender, f.size, f.age, f.featured ? "f" : "-", f.sortBy, f.sortOrder].join("|");
}

/** Key for the server ranking, which ignores sort. */
export function rankingKey(f: Filters): string {
  return [f.category, f.gender, f.size, f.age, f.featured ? "f" : "-"].join("|");
}
