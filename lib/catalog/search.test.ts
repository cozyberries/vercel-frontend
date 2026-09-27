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
    const filter = buildSearchFilter("frock", {
      ...DEFAULT_FILTERS, category: "japanese-muslin", gender: "girls", age: "3-6-years", size: "0-3m", design: "soft-pear", colour: "green", featured: true,
    });
    expect(filter).toEqual({
      $must: [
        { is_featured: { $eq: true } },
        { category_slug: { $eq: "japanese-muslin" } },
        { $or: [{ gender_slug: { $eq: "girl" } }, { gender_slug: { $eq: "unisex" } }] },
        { $or: [{ size_slugs: { $eq: "3-4y" } }, { size_slugs: { $eq: "4-5y" } }, { size_slugs: { $eq: "5-6y" } }] },
        { size_slugs: { $eq: "0-3m" } },
        // Design narrows the ranking (color_slugs is indexed); colour is left to the local filter.
        { color_slugs: { $eq: "soft-pear" } },
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
  it("ranks old Frocks links across the categories Frocks was split into", () => {
    const [category] = buildSearchFilter("pear", { ...DEFAULT_FILTERS, category: "frocks" }).$must as unknown[];
    expect(category).toEqual({
      $or: ["frocks", "frill-sleeve-muslin", "japanese-muslin", "sleeveless-muslin", "muslin-collar"].map((slug) => ({ category_slug: { $eq: slug } })),
    });
  });
  it("accepts a comma-separated list of categories, like gender", () => {
    const [category] = buildSearchFilter("pear", { ...DEFAULT_FILTERS, category: "pyjamas,rompers" }).$must as unknown[];
    expect(category).toEqual({ $or: [{ category_slug: { $eq: "pyjamas" } }, { category_slug: { $eq: "rompers" } }] });
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
    expect(await rankProducts(store, "frock", { ...DEFAULT_FILTERS, design: "soft-pear" })).toEqual(["frock-japanese-soft-pear"]);
    expect(await rankProducts(store, "frock", { ...DEFAULT_FILTERS, design: "moon-and-stars" })).toEqual([]);
    // The fixture frock is still in "frocks"; an old link keeps finding it, a new category does not.
    expect(await rankProducts(store, "frock", { ...DEFAULT_FILTERS, category: "frocks" })).toEqual(["frock-japanese-soft-pear"]);
    expect(await rankProducts(store, "frock", { ...DEFAULT_FILTERS, category: "japanese-muslin" })).toEqual([]);
    expect(await rankProducts(store, "f", DEFAULT_FILTERS)).toEqual([]);
  });
});
