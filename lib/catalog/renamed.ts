// Products and prints whose slugs were corrected (2026-10-10). Client-safe. Old slugs keep
// working: next.config.mjs redirects old product URLs, parseFilters reads old ?design= values,
// and carts/wishlists saved in a browser are re-keyed on load.
import renamed from "./renamed-products.json";

export const RENAMED_PRODUCTS: Readonly<Record<string, string>> = renamed.products;
const RENAMED_PRINTS: Readonly<Record<string, string>> = renamed.prints;

export function currentProductSlug(slug: string): string {
  return RENAMED_PRODUCTS[slug] ?? slug;
}

export function currentPrintSlug(slug: string): string {
  return RENAMED_PRINTS[slug] ?? slug;
}

/** Re-keys saved lines to the current slugs; if two lines now share an id, the first is kept. */
export function withCurrentSlugs<T extends { id: string; color?: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = currentProductSlug(item.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item.color === undefined ? { ...item, id } : { ...item, id, color: currentPrintSlug(item.color) });
  }
  return out;
}
