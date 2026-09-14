import { describe, expect, it } from "vitest";
import { buildProductDoc, buildReference, computeRatingSummaries, toListCard } from "./build";
import { productRows, ratingRows, referenceRows } from "./__fixtures__/catalog-rows";
import {
  DEFAULT_FILTERS,
  MIN_QUERY_LENGTH,
  ageFilterOptions,
  applyFilters,
  filtersKey,
  localSearchMatch,
  matchesFilters,
  normalizeQuery,
  paginate,
  parseFilters,
  rankingKey,
  resolveAgeSizeSlugs,
  resolveGenderSlugs,
  sortCards,
} from "./filter";

const reference = buildReference(referenceRows);
const ratings = computeRatingSummaries(ratingRows);
const cards = productRows.map((row) => toListCard(buildProductDoc(row, { reference, ratings })));
const [frock, coord, jhabla] = cards;

describe("parseFilters", () => {
  it("applies the same defaults as ProductsClient and the legacy API", () => {
    expect(parseFilters(new URLSearchParams(""))).toEqual(DEFAULT_FILTERS);
    expect(DEFAULT_FILTERS).toEqual({
      category: "all", gender: "all", size: "all", age: "all", design: "all", colour: "all", search: "",
      sortBy: "default", sortOrder: "desc", featured: false,
    });
  });
  it("normalises values and accepts Next searchParams records", () => {
    const f = parseFilters({ category: " Frocks ", gender: ["Girls"], sortBy: "price", sortOrder: "asc", featured: "true", search: "  muslin " });
    expect(f).toEqual({ category: "frocks", gender: "girls", size: "all", age: "all", design: "all", colour: "all", search: "muslin", sortBy: "price", sortOrder: "asc", featured: true });
    expect(parseFilters({ sortBy: "weird", sortOrder: "sideways" }).sortBy).toBe("default");
    expect(parseFilters({ sortBy: "weird", sortOrder: "sideways" }).sortOrder).toBe("desc");
  });
  it("reads design (print slug) and colour (base colour slug), accepting the US spelling", () => {
    expect(parseFilters(new URLSearchParams("design=Petal-Pops&colour=White"))).toMatchObject({ design: "petal-pops", colour: "white" });
    expect(parseFilters(new URLSearchParams("color=lilac"))).toMatchObject({ colour: "lilac" });
    expect(parseFilters(new URLSearchParams("colour=lilac&color=white"))).toMatchObject({ colour: "lilac" });
  });
});

describe("gender and age resolution (parity with app/api/products/route.ts)", () => {
  it("maps boys/girls to include unisex", () => {
    expect(resolveGenderSlugs("Boys")).toEqual(["boy", "unisex"]);
    expect(resolveGenderSlugs("girl")).toEqual(["girl", "unisex"]);
    expect(resolveGenderSlugs("unisex")).toEqual(["unisex"]);
    expect(resolveGenderSlugs("other")).toEqual(["other"]);
  });
  it("expands the 3-6y group and passes other ages through", () => {
    expect(resolveAgeSizeSlugs("3-6y")).toEqual(["3-4y", "4-5y", "5-6y"]);
    expect(resolveAgeSizeSlugs("3-6-years")).toEqual(["3-4y", "4-5y", "5-6y"]);
    expect(resolveAgeSizeSlugs("0-3m")).toEqual(["0-3m"]);
  });
});

describe("ageFilterOptions", () => {
  // Size and age are one axis in this store, so the sheet shows Age only, as the homepage bands:
  // single sizes that belong to a multi-size group (3-4Y/4-5Y/5-6Y → "3-6 Years") are folded into it.
  it("hides single sizes covered by a group and keeps the group and the rest, in display order", () => {
    expect(ageFilterOptions(reference).map((a) => a.slug)).toEqual(["0-3m", "3-6m", "3-6y"]);
  });
  it("keeps every size when no group covers it", () => {
    const noGroups = { ...reference, ages: reference.ages.filter((a) => a.sizeSlugs.length === 1) };
    expect(ageFilterOptions(noGroups).map((a) => a.slug)).toEqual(["0-3m", "3-6m", "3-4y", "4-5y", "5-6y"]);
  });
});

describe("matchesFilters", () => {
  it("filters by category, gender (with unisex), size, age and featured", () => {
    expect(matchesFilters(frock!, { ...DEFAULT_FILTERS, category: "frocks" })).toBe(true);
    expect(matchesFilters(coord!, { ...DEFAULT_FILTERS, category: "frocks" })).toBe(false);
    expect(matchesFilters(jhabla!, { ...DEFAULT_FILTERS, gender: "girl" })).toBe(true);
    expect(matchesFilters(coord!, { ...DEFAULT_FILTERS, gender: "girl" })).toBe(false);
    expect(matchesFilters(frock!, { ...DEFAULT_FILTERS, size: "3-6m" })).toBe(true);
    expect(matchesFilters(coord!, { ...DEFAULT_FILTERS, age: "3-6y" })).toBe(true);
    expect(matchesFilters(frock!, { ...DEFAULT_FILTERS, age: "3-6y" })).toBe(false);
    expect(matchesFilters(frock!, { ...DEFAULT_FILTERS, featured: true })).toBe(false);
    expect(matchesFilters(coord!, { ...DEFAULT_FILTERS, featured: true })).toBe(true);
  });
  it("filters by design (print) and by colour (base colour of the print)", () => {
    expect(matchesFilters(frock!, { ...DEFAULT_FILTERS, design: "soft-pear" })).toBe(true);
    expect(matchesFilters(jhabla!, { ...DEFAULT_FILTERS, design: "soft-pear" })).toBe(false);
    expect(matchesFilters(coord!, { ...DEFAULT_FILTERS, design: "soft-pear" })).toBe(false);
    expect(matchesFilters(frock!, { ...DEFAULT_FILTERS, colour: "green" })).toBe(true);
    expect(matchesFilters(jhabla!, { ...DEFAULT_FILTERS, colour: "white" })).toBe(true);
    expect(matchesFilters(jhabla!, { ...DEFAULT_FILTERS, colour: "green" })).toBe(false);
    expect(applyFilters(cards, { ...DEFAULT_FILTERS, colour: "white" }).map((c) => c.slug)).toEqual([jhabla!.slug]);
  });
  it("treats cards built before base colours existed as matching no colour", () => {
    const legacy = { ...frock!, base_colors: undefined } as unknown as typeof frock;
    expect(matchesFilters(legacy!, { ...DEFAULT_FILTERS, colour: "green" })).toBe(false);
    expect(matchesFilters(legacy!, DEFAULT_FILTERS)).toBe(true);
  });
});

describe("sorting", () => {
  it("default is created_at desc, price and name honour sortOrder", () => {
    expect(sortCards(cards, "default", "desc").map((c) => c.slug)).toEqual([coord!.slug, frock!.slug, jhabla!.slug]);
    expect(sortCards(cards, "price", "asc").map((c) => c.price)).toEqual([499, 899, 1299]);
    expect(sortCards(cards, "price", "desc").map((c) => c.price)).toEqual([1299, 899, 499]);
    expect(sortCards(cards, "name", "asc").map((c) => c.name[0])).toEqual(["M", "P", "S"]);
  });
});

describe("search", () => {
  it("matches locally on name, description, category and gender names", () => {
    expect(localSearchMatch(frock!, "frock")).toBe(true);
    expect(localSearchMatch(frock!, "GIRLS")).toBe(true);
    expect(localSearchMatch(coord!, "chinese collar")).toBe(true);
    expect(localSearchMatch(coord!, "frock")).toBe(false);
  });
  it("uses server ranking order when provided and drops unranked cards", () => {
    const ranked = applyFilters(cards, { ...DEFAULT_FILTERS, search: "soft" }, [jhabla!.slug, frock!.slug]);
    expect(ranked.map((c) => c.slug)).toEqual([jhabla!.slug, frock!.slug]);
  });
  it("re-sorts a ranked result when an explicit sort is requested", () => {
    const ranked = applyFilters(cards, { ...DEFAULT_FILTERS, search: "soft", sortBy: "price", sortOrder: "asc" }, [frock!.slug, jhabla!.slug]);
    expect(ranked.map((c) => c.price)).toEqual([499, 899]);
  });
  it("falls back to local matching without a ranking", () => {
    expect(applyFilters(cards, { ...DEFAULT_FILTERS, search: "jhabla" }, null).map((c) => c.slug)).toEqual([jhabla!.slug]);
  });
});

describe("paginate", () => {
  it("returns the legacy pagination object", () => {
    const page2 = paginate(cards, 2, 2);
    expect(page2.products.map((c) => c.slug)).toEqual([jhabla!.slug]);
    expect(page2.pagination).toEqual({ currentPage: 2, totalPages: 2, totalItems: 3, itemsPerPage: 2, hasNextPage: false, hasPrevPage: true });
    expect(paginate([], 1, 12).pagination).toEqual({ currentPage: 1, totalPages: 0, totalItems: 0, itemsPerPage: 12, hasNextPage: false, hasPrevPage: false });
  });
});

describe("keys", () => {
  it("builds stable cache keys", () => {
    expect(filtersKey({ ...DEFAULT_FILTERS, category: "frocks", sortBy: "price" })).toBe("frocks|all|all|all|all|all|-|price|desc");
    expect(filtersKey({ ...DEFAULT_FILTERS, design: "petal-pops", colour: "beige" })).toBe("all|all|all|all|petal-pops|beige|-|default|desc");
    expect(rankingKey({ ...DEFAULT_FILTERS, featured: true })).toBe("all|all|all|all|all|f");
    // Colour is matched locally only (the Redis index has no base-colour field), so it never changes the ranking key.
    expect(rankingKey({ ...DEFAULT_FILTERS, design: "petal-pops", colour: "beige" })).toBe("all|all|all|all|petal-pops|-");
  });
  it("normalises search queries", () => {
    expect(normalizeQuery("  Muslin   FROCK ")).toBe("muslin frock");
    expect(normalizeQuery("x".repeat(200))).toHaveLength(80);
    expect(MIN_QUERY_LENGTH).toBe(2);
  });
});
