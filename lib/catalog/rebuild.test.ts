import { describe, expect, it, vi } from "vitest";
import { coordRow, frockRow, jhablaRow, productRows, ratingRows, referenceRows } from "./__fixtures__/catalog-rows";
import { rebuild, scopeLabel } from "./rebuild";
import { KEYS, createCatalogStore } from "./store";
import type { CatalogDb } from "./supabase";
import { FakeRedis } from "./testing/fake-redis";
import type { ProductRow, SalesRankRow } from "./types";

function makeDb(
  rows: ProductRow[] = productRows,
  idToSlug: Record<string, string> = {},
  salesRanks: SalesRankRow[] = [],
): CatalogDb {
  return {
    fetchSalesRanking: vi.fn(async () => salesRanks),
    fetchProductRows: vi.fn(async (slugs?: string[]) => (slugs ? rows.filter((r) => slugs.includes(r.slug)) : rows)),
    fetchAllProductSlugs: vi.fn(async () => rows.map((r) => r.slug)),
    fetchReferenceRows: vi.fn(async () => referenceRows),
    fetchRatingRows: vi.fn(async (slugs?: string[]) => (slugs ? ratingRows.filter((r) => slugs.includes(r.product_slug)) : ratingRows)),
    resolveProductSlugById: vi.fn(async (id: string) => idToSlug[id] ?? null),
  };
}

const now = () => new Date("2026-09-13T00:00:00.000Z");

describe("scopeLabel", () => {
  it("labels every scope kind", () => {
    expect(scopeLabel({ kind: "product", slug: "x" })).toBe("product:x");
    expect(scopeLabel({ kind: "product-id", id: "9" })).toBe("product-id:9");
    expect(scopeLabel({ kind: "reference" })).toBe("reference");
    expect(scopeLabel({ kind: "full" })).toBe("full");
  });
});

describe("rebuild full", () => {
  it("writes every document, the reference, the snapshot, version, meta and creates the index", async () => {
    const redis = new FakeRedis();
    const store = createCatalogStore(redis);
    const revalidate = vi.fn(async () => {});
    const result = await rebuild({ kind: "full" }, { store, db: makeDb(), now, revalidate });

    expect(result.changed).toBe(true);
    expect(result.productCount).toBe(3);
    expect(result.touchedSlugs.sort()).toEqual(productRows.map((r) => r.slug).sort());
    expect(await store.readVersion()).toBe(result.version);
    expect((await store.readSnapshot())?.products.map((p) => p.slug)).toEqual([coordRow.slug, frockRow.slug, jhablaRow.slug]);
    expect(await store.readReference()).not.toBeNull();
    expect((await store.readMeta())?.ok).toBe(true);
    expect((await store.readMeta())?.indexDocCount).toBe(3);
    expect([...redis.indexes.keys()]).toEqual(["cozyberries-search"]);
    expect(revalidate).toHaveBeenCalledWith({ slugs: expect.arrayContaining([frockRow.slug]), versionChanged: true });
  });

  it("is idempotent: a second identical run changes nothing and does not bump the version", async () => {
    const store = createCatalogStore(new FakeRedis());
    const first = await rebuild({ kind: "full" }, { store, db: makeDb(), now });
    const revalidate = vi.fn(async () => {});
    const second = await rebuild({ kind: "full" }, { store, db: makeDb(), now, revalidate });
    expect(second.changed).toBe(false);
    expect(second.version).toBe(first.version);
    expect(revalidate).toHaveBeenCalledWith({ slugs: expect.any(Array), versionChanged: false });
  });

  it("deletes documents for products that disappeared", async () => {
    const store = createCatalogStore(new FakeRedis());
    await rebuild({ kind: "full" }, { store, db: makeDb(), now });
    const result = await rebuild({ kind: "full" }, { store, db: makeDb([frockRow, coordRow]), now });
    expect(result.changed).toBe(true);
    expect(await store.readProduct(jhablaRow.slug)).toBeNull();
    expect((await store.readSnapshot())?.products.map((p) => p.slug)).toEqual([coordRow.slug, frockRow.slug]);
    expect(result.touchedSlugs).toContain(jhablaRow.slug);
  });
});

describe("rebuild product", () => {
  it("widens to full when no snapshot exists yet", async () => {
    const store = createCatalogStore(new FakeRedis());
    const db = makeDb();
    const result = await rebuild({ kind: "product", slug: frockRow.slug }, { store, db, now });
    expect(result.scope).toEqual({ kind: "full" });
    expect(db.fetchProductRows).toHaveBeenCalledWith(undefined);
  });

  it("patches one document and the snapshot without refetching everything", async () => {
    const store = createCatalogStore(new FakeRedis());
    await rebuild({ kind: "full" }, { store, db: makeDb(), now });
    const renamed = { ...frockRow, name: "Renamed Frock" };
    const db = makeDb([renamed, coordRow, jhablaRow]);
    const revalidate = vi.fn(async () => {});
    const result = await rebuild({ kind: "product", slug: frockRow.slug }, { store, db, now, revalidate });

    expect(db.fetchProductRows).toHaveBeenCalledWith([frockRow.slug]);
    expect(db.fetchReferenceRows).not.toHaveBeenCalled();
    expect(result.changed).toBe(true);
    expect((await store.readProduct(frockRow.slug))?.name).toBe("Renamed Frock");
    expect((await store.readSnapshot())?.products.find((p) => p.slug === frockRow.slug)?.name).toBe("Renamed Frock");
    expect(revalidate).toHaveBeenCalledWith({ slugs: [frockRow.slug], versionChanged: true });
  });

  it("removes a product that no longer exists in Supabase", async () => {
    const store = createCatalogStore(new FakeRedis());
    await rebuild({ kind: "full" }, { store, db: makeDb(), now });
    const result = await rebuild({ kind: "product", slug: jhablaRow.slug }, { store, db: makeDb([frockRow, coordRow]), now });
    expect(await store.readProduct(jhablaRow.slug)).toBeNull();
    expect((await store.readSnapshot())?.products).toHaveLength(2);
    expect(result.touchedSlugs).toEqual([jhablaRow.slug]);
  });

  it("recreates a missing index even for a product-scope rebuild", async () => {
    const redis = new FakeRedis();
    const store = createCatalogStore(redis);
    await rebuild({ kind: "full" }, { store, db: makeDb(), now });
    redis.indexes.clear();
    await rebuild({ kind: "product", slug: frockRow.slug }, { store, db: makeDb(), now });
    expect([...redis.indexes.keys()]).toEqual(["cozyberries-search"]);
  });

  it("resolves product-id scopes and falls back to full when unresolvable", async () => {
    const store = createCatalogStore(new FakeRedis());
    await rebuild({ kind: "full" }, { store, db: makeDb(), now });
    const resolved = await rebuild({ kind: "product-id", id: "42" }, { store, db: makeDb(productRows, { "42": frockRow.slug }), now });
    expect(resolved.scope).toEqual({ kind: "product", slug: frockRow.slug });
    const widened = await rebuild({ kind: "product-id", id: "99" }, { store, db: makeDb(), now });
    expect(widened.scope).toEqual({ kind: "full" });
  });

  it("treats reference scope as full", async () => {
    const store = createCatalogStore(new FakeRedis());
    const db = makeDb();
    const result = await rebuild({ kind: "reference" }, { store, db, now });
    expect(result.scope).toEqual({ kind: "full" });
    expect(db.fetchReferenceRows).toHaveBeenCalledTimes(1);
    expect(await store.exists(KEYS.reference)).toBe(true);
  });
});

describe("rebuild sales ranking", () => {
  const ranks = (snapshot: { products: Array<{ slug: string; sales_rank?: number | null }> } | null) =>
    Object.fromEntries((snapshot?.products ?? []).map((p) => [p.slug, p.sales_rank]));

  it("stamps every card with its sales rank and orders best sellers first", async () => {
    const store = createCatalogStore(new FakeRedis());
    const db = makeDb(productRows, {}, [{ product_slug: frockRow.slug, sales_rank: 1 }]);
    await rebuild({ kind: "full" }, { store, db, now });
    const snapshot = await store.readSnapshot();
    expect(ranks(snapshot)).toEqual({ [frockRow.slug]: 1, [coordRow.slug]: null, [jhablaRow.slug]: null });
    // jhabla has no photo, so it stays last.
    expect(snapshot?.products.map((p) => p.slug)).toEqual([frockRow.slug, coordRow.slug, jhablaRow.slug]);
  });

  it("re-stamps untouched cards on a product rebuild", async () => {
    const store = createCatalogStore(new FakeRedis());
    await rebuild({ kind: "full" }, { store, db: makeDb(productRows, {}, [{ product_slug: frockRow.slug, sales_rank: 1 }]), now });
    const db = makeDb(productRows, {}, [
      { product_slug: coordRow.slug, sales_rank: 1 },
      { product_slug: frockRow.slug, sales_rank: 2 },
    ]);
    await rebuild({ kind: "product", slug: jhablaRow.slug }, { store, db, now });
    const snapshot = await store.readSnapshot();
    expect(ranks(snapshot)).toEqual({ [coordRow.slug]: 1, [frockRow.slug]: 2, [jhablaRow.slug]: null });
    expect(snapshot?.products.map((p) => p.slug)).toEqual([coordRow.slug, frockRow.slug, jhablaRow.slug]);
  });

  it("keeps the previous ranks when the ranking cannot be read", async () => {
    const store = createCatalogStore(new FakeRedis());
    await rebuild({ kind: "full" }, { store, db: makeDb(productRows, {}, [{ product_slug: frockRow.slug, sales_rank: 1 }]), now });
    const db = makeDb([{ ...coordRow, name: "Renamed Coord" }, frockRow, jhablaRow]);
    db.fetchSalesRanking = vi.fn(async () => {
      throw new Error("[catalog/supabase] sales ranking: boom");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await rebuild({ kind: "product", slug: coordRow.slug }, { store, db, now });
    expect(result.changed).toBe(true);
    expect(ranks(await store.readSnapshot())).toEqual({ [frockRow.slug]: 1, [coordRow.slug]: null, [jhablaRow.slug]: null });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
