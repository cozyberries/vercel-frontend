import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildProductDoc, buildReference, buildSnapshot, computeRatingSummaries, toListCard } from "./build";
import { frockRow, productRows, ratingRows, referenceRows } from "./__fixtures__/catalog-rows";
import { DEFAULT_FILTERS } from "./filter";
import { createCatalogStore, type CatalogStore } from "./store";
import { FakeRedis } from "./testing/fake-redis";

const revalidateTag = vi.fn();
const revalidatePath = vi.fn();
const notifyCatalogAlert = vi.fn();
let store: CatalogStore;

const db = {
  fetchProductRows: vi.fn(async (slugs?: string[]) => (slugs ? productRows.filter((r) => slugs.includes(r.slug)) : productRows)),
  fetchAllProductSlugs: vi.fn(async () => productRows.map((r) => r.slug)),
  fetchReferenceRows: vi.fn(async () => referenceRows),
  fetchRatingRows: vi.fn(async () => ratingRows),
  resolveProductSlugById: vi.fn(async () => null),
};

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

vi.mock("./store", async (importOriginal) => {
  const original = await importOriginal<typeof import("./store")>();
  return { ...original, catalogStore: () => store };
});

vi.mock("./supabase", () => ({
  get catalogDb() {
    return db;
  },
}));

vi.mock("@/lib/services/telegram", () => ({ notifyCatalogAlert: (...args: unknown[]) => notifyCatalogAlert(...args) }));

import { CATALOG_TAG, getProduct, getRanking, getSnapshot, productTag, revalidateCatalog } from "./cache";

const reference = buildReference(referenceRows);
const docs = productRows.map((row) => buildProductDoc(row, { reference, ratings: computeRatingSummaries(ratingRows) }));

describe("catalog cache layer", () => {
  beforeEach(() => {
    store = createCatalogStore(new FakeRedis());
    revalidateTag.mockClear();
    revalidatePath.mockClear();
    notifyCatalogAlert.mockClear();
    db.fetchProductRows.mockClear();
  });

  it("serves the snapshot from Redis when present", async () => {
    const { snapshot } = buildSnapshot(docs.map(toListCard), reference, null, new Date());
    await store.writeCatalog({ docs, deleteSlugs: [], reference, snapshot, meta: { version: snapshot.version, lastRebuildAt: "", scope: "full", durationMs: 0, ok: true, productCount: 3, indexDocCount: 3 } });
    const result = await getSnapshot();
    expect(result.source).toBe("redis");
    expect(result.snapshot.version).toBe(snapshot.version);
    expect(db.fetchProductRows).not.toHaveBeenCalled();
  });

  it("falls back to Supabase when the snapshot is missing and alerts once per hour", async () => {
    const first = await getSnapshot();
    expect(first.source).toBe("fallback");
    expect(first.snapshot.products).toHaveLength(3);
    await getSnapshot();
    expect(notifyCatalogAlert).toHaveBeenCalledTimes(1);
  });

  it("serves a product from Redis, else builds it from Supabase and writes it back", async () => {
    const missing = await getProduct(frockRow.slug);
    expect(missing.source).toBe("fallback");
    expect(missing.product?.slug).toBe(frockRow.slug);
    expect(await store.readProduct(frockRow.slug)).not.toBeNull();
    const hit = await getProduct(frockRow.slug);
    expect(hit.source).toBe("redis");
    expect((await getProduct("does-not-exist")).product).toBeNull();
  });

  it("returns null ranking for short queries or search failures", async () => {
    expect(await getRanking("f", DEFAULT_FILTERS)).toBeNull();
    store = { ...store, searchKeys: async () => { throw new Error("index missing"); } };
    expect(await getRanking("frock", DEFAULT_FILTERS)).toBeNull();
  });

  it("returns ranked slugs when the index answers", async () => {
    await store.ensureIndex();
    for (const doc of docs) await store.writeProduct(doc);
    expect(await getRanking("frock", DEFAULT_FILTERS)).toEqual([frockRow.slug]);
  });

  it("revalidates product tags always and the catalog tag only on version change", async () => {
    await revalidateCatalog({ slugs: ["a", "b"], versionChanged: false });
    expect(revalidateTag).toHaveBeenCalledWith(productTag("a"));
    expect(revalidatePath).toHaveBeenCalledWith("/products/b");
    expect(revalidateTag).not.toHaveBeenCalledWith(CATALOG_TAG);

    await revalidateCatalog({ slugs: [], versionChanged: true });
    expect(revalidateTag).toHaveBeenCalledWith(CATALOG_TAG);
    expect(revalidatePath).toHaveBeenCalledWith("/api/catalog");
    expect(revalidatePath).toHaveBeenCalledWith("/products");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });
});
