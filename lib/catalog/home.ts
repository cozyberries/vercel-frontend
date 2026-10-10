// Product rows on the home page, picked from the catalog snapshot on the server. Client-safe.
import { compareBestSeller, featuredCards } from "./order";
import type { ListCard } from "./types";

export interface HomeProductRows {
  /** Best-selling in-stock products with a baby-model photo, badged as Featured. */
  featured: ListCard[];
  /** The next best sellers (any photo), never repeating a Featured product. */
  lovedByParents: ListCard[];
}

/** How many products are "Featured": the home row's length, and the only cards with the badge. */
export const FEATURED_COUNT = 5;

/** The featured products' slugs, best first. One rule for the home row, /products and product pages. */
export function featuredSlugs(cards: ListCard[]): Set<string> {
  return new Set(featuredCards(cards, FEATURED_COUNT).map((card) => card.slug));
}

/** Sets the "Featured" badge from `slugs`, replacing the old is_featured flag from the database. */
export function withFeaturedBadge<T extends { slug: string; is_featured?: boolean }>(items: T[], slugs: Set<string>): T[] {
  return items.map((item) => ({ ...item, is_featured: slugs.has(item.slug) }));
}

export function homeProductRows(cards: ListCard[], limits: { featured: number; lovedByParents: number }): HomeProductRows {
  // The badge follows this row, not the old is_featured flag in the database.
  const featured = featuredCards(cards, limits.featured).map((card) => ({ ...card, is_featured: true }));
  const shown = new Set(featured.map((card) => card.slug));
  const lovedByParents = cards
    .filter((card) => card.in_stock && !shown.has(card.slug))
    .sort(compareBestSeller)
    .slice(0, limits.lovedByParents)
    .map((card) => ({ ...card, is_featured: false }));
  return { featured, lovedByParents };
}
