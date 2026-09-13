// Next Data Cache in front of Redis. Request handlers and server components read the
// catalog ONLY through this module, so Redis is touched once per invalidation, not per view.
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { fallbackProduct, fallbackSnapshot, noteFallback } from "./fallback";
import { rankingKey } from "./filter";
import { normalizeQuery, rankProducts, MIN_QUERY_LENGTH } from "./search";
import { catalogStore } from "./store";
import type { CatalogSource, Filters, ProductDoc, Snapshot } from "./types";

export const CATALOG_TAG = "catalog";
export const productTag = (slug: string): string => `product:${slug}`;
const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7;

class CatalogMissError extends Error {}

const cachedSnapshot = unstable_cache(
  async (): Promise<Snapshot> => {
    const snapshot = await catalogStore().readSnapshot();
    if (!snapshot) throw new CatalogMissError("snapshot missing");
    return snapshot;
  },
  ["cat:snapshot"],
  { tags: [CATALOG_TAG], revalidate: ONE_WEEK_SECONDS },
);

export async function getSnapshot(): Promise<{ snapshot: Snapshot; source: CatalogSource }> {
  try {
    return { snapshot: await cachedSnapshot(), source: "redis" };
  } catch (error) {
    await noteFallback("snapshot", error);
    return { snapshot: await fallbackSnapshot(), source: "fallback" };
  }
}

export async function getProduct(slug: string): Promise<{ product: ProductDoc | null; source: CatalogSource }> {
  const cached = unstable_cache(
    async (): Promise<ProductDoc> => {
      const doc = await catalogStore().readProduct(slug);
      if (!doc) throw new CatalogMissError(`product ${slug} missing`);
      return doc;
    },
    ["cat:product", slug],
    { tags: [CATALOG_TAG, productTag(slug)], revalidate: ONE_WEEK_SECONDS },
  );
  try {
    return { product: await cached(), source: "redis" };
  } catch (error) {
    await noteFallback(`product:${slug}`, error);
    return { product: await fallbackProduct(slug), source: "fallback" };
  }
}

/** Ordered slugs from Redis Search, cached per normalised query and filter set. null = unavailable. */
export async function getRanking(search: string, filters: Filters): Promise<string[] | null> {
  const q = normalizeQuery(search);
  if (q.length < MIN_QUERY_LENGTH) return null;
  const cached = unstable_cache(
    () => rankProducts(catalogStore(), q, filters),
    ["cat:rank", q, rankingKey(filters)],
    { tags: [CATALOG_TAG], revalidate: ONE_WEEK_SECONDS },
  );
  try {
    return await cached();
  } catch (error) {
    console.warn(`[catalog] ranking unavailable for "${q}":`, error instanceof Error ? error.message : error);
    return null;
  }
}

/** Called by the rebuild job. Product tags/paths always; catalog-wide entries only when the version changed. */
export async function revalidateCatalog(args: { slugs: string[]; versionChanged: boolean }): Promise<void> {
  for (const slug of args.slugs) {
    revalidateTag(productTag(slug));
    revalidatePath(`/products/${slug}`);
  }
  if (args.versionChanged) {
    revalidateTag(CATALOG_TAG);
    revalidatePath("/api/catalog");
    revalidatePath("/products");
    revalidatePath("/");
  }
}
