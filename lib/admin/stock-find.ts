// The Find view on /admin/stock: what is at the stall, what is at home, for a gender and a size.
// Pure and client-safe. The stall shelf keeps one piece of every size in stock; the rest is back
// stock at home. No refill ticks are read: a confirmed stall sale lowers stock, so before the ✅
// "home" is exact and after it "home" is one low, never one high.
import type { StockProductRow } from "./stock-metrics";

export type FindState = "in" | "low" | "last" | "out";
export type FindGender = "any" | "girl" | "boy";
export type StockView = "overview" | "find";

export interface FindFilters {
  gender: FindGender;
  /** A size slug such as "2-3y"; null = any size. */
  size: string | null;
}

export interface FindCounts {
  in: number;
  low: number;
  last: number;
  out: number;
}

export interface FindSize {
  variant_slug: string;
  size_slug: string | null;
  size_label: string;
  stock: number;
  stall: 0 | 1;
  home: number;
  state: FindState;
}

export interface FindProduct {
  slug: string;
  name: string;
  image: string | null;
  counts: FindCounts;
  sizes: FindSize[];
}

export interface FindCategory {
  slug: string | null;
  name: string;
  counts: FindCounts;
  products: FindProduct[];
}

export interface SizeOption {
  slug: string;
  label: string;
}

export const FIND_STATE_LABEL: Record<FindState, string> = {
  in: "In stock",
  low: "Low",
  last: "Last piece",
  out: "Out",
};

const STATE_RANK: Record<FindState, number> = { in: 0, low: 1, last: 2, out: 3 };
const GENDER_LABEL: Record<Exclude<FindGender, "any">, string> = { girl: "Girl", boy: "Boy" };

const emptyCounts = (): FindCounts => ({ in: 0, low: 0, last: 0, out: 0 });
const bySlug = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/** One piece at the stall while any is left; everything else at home. */
export function splitStock(stock: number): { stall: 0 | 1; home: number } {
  const n = Math.max(0, Math.floor(Number(stock) || 0));
  return { stall: n >= 1 ? 1 : 0, home: Math.max(0, n - 1) };
}

export function findState(stock: number): FindState {
  if (stock >= 3) return "in";
  if (stock >= 2) return "low";
  if (stock >= 1) return "last";
  return "out";
}

/** Girl and Boy both include unisex products and products with no gender set. */
export function matchesGender(genderSlug: string | null, gender: FindGender): boolean {
  if (gender === "any") return true;
  if (!genderSlug || genderSlug === "unisex") return true;
  return genderSlug === gender;
}

/** Each size slug present in the data once, in catalog size order. One-size variants have no chip. */
export function findSizeOptions(products: StockProductRow[]): SizeOption[] {
  const seen = new Map<string, SizeOption & { order: number }>();
  for (const p of products) {
    for (const s of p.sizes) {
      if (!s.size_slug || seen.has(s.size_slug)) continue;
      seen.set(s.size_slug, { slug: s.size_slug, label: s.size_label, order: s.size_order });
    }
  }
  return [...seen.values()]
    .sort((a, b) => a.order - b.order || bySlug(a.slug, b.slug))
    .map(({ slug, label }) => ({ slug, label }));
}

/** A size from the URL that matches no option (typo, retired size) means Any. */
export function knownSize(size: string | null, options: SizeOption[]): string | null {
  return size && options.some((o) => o.slug === size) ? size : null;
}

export function buildFindTree(products: StockProductRow[], filters: FindFilters): FindCategory[] {
  const categories = new Map<string, FindCategory>();
  for (const p of products) {
    if (!matchesGender(p.gender_slug, filters.gender)) continue;
    const sizes: FindSize[] = p.sizes
      .filter((s) => (filters.size ? s.size_slug === filters.size : true))
      .map((s) => ({
        variant_slug: s.variant_slug,
        size_slug: s.size_slug,
        size_label: s.size_label,
        stock: s.stock,
        ...splitStock(s.stock),
        state: findState(s.stock),
      }));
    if (sizes.length === 0) continue;

    const key = p.category_slug ?? "";
    const category = categories.get(key) ?? { slug: p.category_slug, name: p.category_name, counts: emptyCounts(), products: [] };
    const counts = emptyCounts();
    for (const s of sizes) {
      counts[s.state] += 1;
      category.counts[s.state] += 1;
    }
    category.products.push({ slug: p.slug, name: p.name, image: p.image, counts, sizes });
    categories.set(key, category);
  }

  const bestRank = (p: FindProduct) => Math.min(...p.sizes.map((s) => STATE_RANK[s.state]));
  for (const c of categories.values()) {
    c.products.sort(filters.size ? (a, b) => bestRank(a) - bestRank(b) || byName(a, b) : byName);
  }
  return [...categories.values()].sort(byName);
}

/** "12 in · 3 low · 2 out" — zero parts left out. */
export function formatFindCounts(c: FindCounts): string {
  return (["in", "low", "last", "out"] as const)
    .filter((k) => c[k] > 0)
    .map((k) => `${c[k]} ${k}`)
    .join(" · ");
}

export function findEmptyTitle(gender: FindGender, sizeLabel: string | null): string {
  const who = gender === "any" ? "" : ` for ${GENDER_LABEL[gender]}`;
  if (sizeLabel) return `Nothing in ${sizeLabel}${who}`;
  return who ? `Nothing${who}` : "No active products";
}

export function readStockParams(search: string): { view: StockView; filters: FindFilters } {
  const p = new URLSearchParams(search);
  const g = p.get("gender");
  return {
    view: p.get("view") === "find" ? "find" : "overview",
    filters: {
      gender: g === "girl" || g === "boy" ? g : "any",
      size: p.get("size")?.trim().toLowerCase() || null,
    },
  };
}

/** Path + query for history.replaceState. Overview drops the Find params; defaults are left out. */
export function writeStockParams(href: string, view: StockView, filters: FindFilters): string {
  const url = new URL(href);
  for (const key of ["view", "gender", "size"]) url.searchParams.delete(key);
  if (view === "find") {
    url.searchParams.set("view", "find");
    if (filters.gender !== "any") url.searchParams.set("gender", filters.gender);
    if (filters.size) url.searchParams.set("size", filters.size);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
