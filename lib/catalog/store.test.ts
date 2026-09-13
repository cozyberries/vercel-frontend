import { describe, expect, it } from "vitest";
import { buildProductDoc, buildReference, buildSnapshot, computeRatingSummaries, toListCard } from "./build";
import { frockRow, productRows, ratingRows, referenceRows } from "./__fixtures__/catalog-rows";
import { CATALOG_INDEX_NAME, KEYS, createCatalogStore } from "./store";
import { FakeRedis } from "./testing/fake-redis";
import type { CatalogMeta } from "./types";

const reference = buildReference(referenceRows);
const ratings = computeRatingSummaries(ratingRows);
const docs = productRows.map((row) => buildProductDoc(row, { reference, ratings }));
const meta: CatalogMeta = {
  version: "v1", lastRebuildAt: "2026-09-13T00:00:00.000Z", scope: "full", durationMs: 1, ok: true, productCount: 3, indexDocCount: 3,
};

describe("createCatalogStore", () => {
  it("writes and reads documents, reference, snapshot, version and meta in one pipeline", async () => {
    const redis = new FakeRedis();
    const store = createCatalogStore(redis);
    const { snapshot } = buildSnapshot(docs.map(toListCard), reference, null, new Date());
    await store.writeCatalog({ docs, deleteSlugs: [], reference, snapshot, meta });

    expect(await store.readProduct(frockRow.slug)).toEqual(docs[0]);
    expect((await store.readDocs(docs.map((d) => d.slug))).map((d) => d.slug)).toEqual(docs.map((d) => d.slug));
    expect(await store.readReference()).toEqual(reference);
    expect(await store.readSnapshot()).toEqual(snapshot);
    expect(await store.readVersion()).toBe(snapshot.version);
    expect(await store.readMeta()).toEqual(meta);
  });

  it("deletes documents and skips missing ones when reading many", async () => {
    const redis = new FakeRedis();
    const store = createCatalogStore(redis);
    await store.writeCatalog({ docs, deleteSlugs: [], meta });
    await store.writeCatalog({ docs: [], deleteSlugs: [frockRow.slug], meta });
    expect(await store.readProduct(frockRow.slug)).toBeNull();
    expect(await store.readDocs([frockRow.slug, docs[1]!.slug])).toHaveLength(1);
    expect(await store.readDocs([])).toEqual([]);
  });

  it("implements NX lock, debounce marker and windowed counter semantics", async () => {
    const redis = new FakeRedis();
    const store = createCatalogStore(redis);
    const token = await store.acquireLock(1000);
    expect(token).not.toBeNull();
    expect(await store.acquireLock(1000)).toBeNull();
    await store.releaseLock("wrong-token");
    expect(await store.exists(KEYS.lock)).toBe(true);
    await store.releaseLock(token!);
    expect(await store.exists(KEYS.lock)).toBe(false);

    expect(await store.setIfAbsent(KEYS.pending("product:x"), 8)).toBe(true);
    expect(await store.setIfAbsent(KEYS.pending("product:x"), 8)).toBe(false);
    redis.now = () => Date.now() + 9000;
    expect(await store.setIfAbsent(KEYS.pending("product:x"), 8)).toBe(true);

    expect(await store.incrWithTtl(KEYS.published, 60)).toBe(1);
    expect(await store.incrWithTtl(KEYS.published, 60)).toBe(2);
  });

  it("creates the single index idempotently and searches keys", async () => {
    const redis = new FakeRedis();
    const store = createCatalogStore(redis);
    await store.writeCatalog({ docs, deleteSlugs: [], meta });
    await store.ensureIndex();
    await store.ensureIndex();
    expect([...redis.indexes.keys()]).toEqual([CATALOG_INDEX_NAME]);
    await expect(redis.search.createIndex({ name: CATALOG_INDEX_NAME, prefix: KEYS.productPrefix })).rejects.toThrow(/already exists/);
    await store.waitIndexing();
    expect(await store.indexDocCount()).toBe(3);
    const keys = await store.searchKeys({ category_slug: { $eq: "frocks" } }, 10);
    expect(keys).toEqual([KEYS.product(frockRow.slug)]);
  });
});
