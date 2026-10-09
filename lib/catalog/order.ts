// Storefront product order. Client-safe (no node imports): used by the catalog build and by
// the browser-side filter/sort in filter.ts.

export type Listed = { created_at: string; slug: string; images?: string[]; sales_rank?: number | null };

/** Products with a photo before those without; every storefront order applies this first. */
export function comparePhotoFirst(a: Pick<Listed, "images">, b: Pick<Listed, "images">): number {
  return Number((b.images?.length ?? 0) > 0) - Number((a.images?.length ?? 0) > 0);
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

/** Default ("Popular") order: photo first, then best sellers, then newest, then slug. */
export function compareListed(a: Listed, b: Listed): number {
  return (
    comparePhotoFirst(a, b) ||
    compareSalesRank(a, b) ||
    b.created_at.localeCompare(a.created_at) ||
    a.slug.localeCompare(b.slug)
  );
}
