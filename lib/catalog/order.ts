// Storefront product order. Client-safe (no node imports): used by the catalog build and by
// the browser-side filter/sort in filter.ts.
import modelPhotos from "../display/model-photos.json";

export type Listed = { created_at: string; slug: string; images?: string[]; sales_rank?: number | null };

/** Products with a photo before those without; every storefront order applies this first. */
export function comparePhotoFirst(a: Pick<Listed, "images">, b: Pick<Listed, "images">): number {
  return Number((b.images?.length ?? 0) > 0) - Number((a.images?.length ?? 0) > 0);
}

// Products whose first photo shows a baby model (tagged by hand for /display; untagged = no).
const WITH_BABY = new Set<string>(modelPhotos.withBaby);

export function hasModelPhoto(slug: string): boolean {
  return WITH_BABY.has(slug);
}

function compareModelPhotoFirst(a: Pick<Listed, "slug">, b: Pick<Listed, "slug">): number {
  return Number(hasModelPhoto(b.slug)) - Number(hasModelPhoto(a.slug));
}

/** Lower rank sells more; unsold (null or missing) goes after every ranked product. */
function compareSalesRank(a: Listed, b: Listed): number {
  const ra = a.sales_rank ?? null;
  const rb = b.sales_rank ?? null;
  if (ra === rb) return 0;
  if (ra === null) return 1;
  if (rb === null) return -1;
  return ra - rb;
}

/** Best sellers first (photo still first), then newest, then slug. Ignores the baby-model rule. */
export function compareBestSeller(a: Listed, b: Listed): number {
  return comparePhotoFirst(a, b) || compareSalesRank(a, b) || b.created_at.localeCompare(a.created_at) || a.slug.localeCompare(b.slug);
}

/** Default ("Popular") order: photo first, baby-model photo next, then best sellers, then newest, then slug. */
export function compareListed(a: Listed, b: Listed): number {
  return (
    comparePhotoFirst(a, b) ||
    compareModelPhotoFirst(a, b) ||
    compareSalesRank(a, b) ||
    b.created_at.localeCompare(a.created_at) ||
    a.slug.localeCompare(b.slug)
  );
}

/** Home "Featured" row: in-stock products with a baby-model photo, best sellers first, then newest. */
export function featuredCards<T extends Listed & { in_stock: boolean }>(cards: T[], limit: number): T[] {
  return cards
    .filter((c) => c.in_stock && (c.images?.length ?? 0) > 0 && hasModelPhoto(c.slug))
    .sort(compareListed)
    .slice(0, limit);
}
