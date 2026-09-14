import { describe, expect, it } from "vitest";
import { buildProductDoc, buildReference, computeRatingSummaries } from "./build";
import { productRows, ratingRows, referenceRows } from "./__fixtures__/catalog-rows";
import { DEFAULT_FILTERS } from "./filter";
import { MIN_QUERY_LENGTH, buildSearchFilter, normalizeQuery, rankProducts } from "./search";
import { createCatalogStore } from "./store";
import { FakeRedis } from "./testing/fake-redis";

const reference = buildReference(referenceRows);
const docs = productRows.map((row) => buildProductDoc(row, { reference, ratings: computeRatingSummaries(ratingRows) }));

describe("normalizeQuery", () => {
  it("lowercases, collapses whitespace and caps length", () => {
    expect(normalizeQuery("  Muslin   FROCK ")).toBe("muslin frock");
    expect(normalizeQuery("x".repeat(200))).toHaveLength(80);
    expect(MIN_QUERY_LENGTH).toBe(2);
  });
});

describe("buildSearchFilter", () => {
  it("requires every active filter and at least one text match", () => {
    const filter = buildSearchFilter("frock", { ...DEFAULT_FILTERS, category: "frocks", gender: "girls", age: "3-6-years", size: "0-3m", featured: true });
    expect(filter).toEqual({
      $must: [
        { is_featured: { $eq: true } },
        { category_slug: { $eq: "frocks" } },
        { $or: [{ gender_slug: { $eq: "girl" } }, { gender_slug: { $eq: "unisex" } }] },
        { $or: [{ size_slugs: { $eq: "3-4y" } }, { size_slugs: { $eq: "4-5y" } }, { size_slugs: { $eq: "5-6y" } }] },
        { size_slugs: { $eq: "0-3m" } },
        {
          $should: [
            { name: { $smart: "frock" }, $boost: 10 },
            { description: { $smart: "frock" }, $boost: 3 },
            { features: { $smart: "frock" }, $boost: 2 },
          ],
        },
      ],
    });
  });
});

describe("rankProducts", () => {
  it("returns product slugs for matching documents and nothing for short queries", async () => {
    const redis = new FakeRedis();
    const store = createCatalogStore(redis);
    await store.ensureIndex();
    for (const doc of docs) await store.writeProduct(doc);

    expect(await rankProducts(store, "frock", DEFAULT_FILTERS)).toEqual(["frock-japanese-soft-pear"]);
    // "shorts" appears only in the coord set's description; "collar" would also match the frock.
    expect(await rankProducts(store, "shorts", { ...DEFAULT_FILTERS, gender: "boy" })).toEqual(["coords-set-chinese-collar-soft-pear"]);
    expect(await rankProducts(store, "shorts", { ...DEFAULT_FILTERS, gender: "girl" })).toEqual([]);
    expect(await rankProducts(store, "f", DEFAULT_FILTERS)).toEqual([]);
  });
});
