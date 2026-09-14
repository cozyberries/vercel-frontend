import { describe, expect, it } from "vitest";
import {
  AGE_GROUPS,
  buildProductDoc,
  buildReference,
  buildSnapshot,
  computeRatingSummaries,
  computeVersion,
  deriveAgeSlugs,
  mergeCards,
  normalizeAgeSlug,
  sortDefault,
  toListCard,
} from "./build";
import { coordRow, frockRow, jhablaRow, productRows, ratingRows, referenceRows } from "./__fixtures__/catalog-rows";

const reference = buildReference(referenceRows);
const ratings = computeRatingSummaries(ratingRows);
const ctx = { reference, ratings };

describe("buildReference", () => {
  it("drops hidden categories and sorts by name", () => {
    expect(reference.categories.map((c) => c.slug)).toEqual(["boys-coord-sets", "frocks", "jhabla"]);
  });
  it("orders genders Unisex, Girls, Boys like the legacy options route", () => {
    expect(reference.genders.map((g) => g.slug)).toEqual(["unisex", "girl", "boy"]);
  });
  it("orders sizes by display_order and builds ages from sizes plus the 3-6y group", () => {
    expect(reference.sizes.map((s) => s.slug)).toEqual(["0-3m", "3-6m", "3-4y", "4-5y", "5-6y"]);
    const group = reference.ages.find((a) => a.slug === "3-6y");
    expect(group?.sizeSlugs).toEqual(["3-4y", "4-5y", "5-6y"]);
    expect(reference.ages.filter((a) => a.slug === "0-3m")[0]?.sizeSlugs).toEqual(["0-3m"]);
    expect(AGE_GROUPS).toHaveLength(1);
  });
  it("carries each print's base colour so the storefront can filter by actual clothing colour", () => {
    expect(reference.colors).toEqual([
      { slug: "soft-pear", name: "Soft Pear", hex: "#d9e8c5", base_color: "Green" },
      { slug: "moon-and-stars", name: "Moon and Stars", hex: null, base_color: "White" },
      { slug: "naugthy-nuts", name: "Naugthy Nuts", hex: null, base_color: null },
    ]);
  });
});

describe("deriveAgeSlugs / normalizeAgeSlug", () => {
  it("includes the 3-6y group when any member size is present", () => {
    expect(deriveAgeSlugs(["3-4y"], reference)).toEqual(["3-4y", "3-6y"]);
    expect(deriveAgeSlugs(["0-3m"], reference)).toEqual(["0-3m"]);
  });
  it("maps the legacy alias", () => {
    expect(normalizeAgeSlug("3-6-years")).toBe("3-6y");
    expect(normalizeAgeSlug(" 0-3M ")).toBe("0-3m");
  });
});

describe("computeRatingSummaries", () => {
  it("averages to one decimal and ignores null ratings", () => {
    expect(ratings["frock-japanese-soft-pear"]).toEqual({ average: 4.5, count: 2 });
    expect(ratings["coords-set-chinese-collar-soft-pear"]).toBeUndefined();
  });
});

describe("buildProductDoc", () => {
  const frock = buildProductDoc(frockRow, ctx);
  const coord = buildProductDoc(coordRow, ctx);
  const jhabla = buildProductDoc(jhablaRow, ctx);

  it("orders images by display_order and keeps all of them on the doc", () => {
    expect(frock.images).toEqual([
      "https://img/frock/1.jpg",
      "https://img/frock/2.jpg",
      "https://img/frock/3.jpg",
      "https://img/frock/4.jpg",
    ]);
  });
  it("aggregates sizes with lowest price and summed stock, sorted by display_order", () => {
    expect(frock.sizes).toEqual([
      { name: "0-3M", slug: "0-3m", price: 899, stock_quantity: 4, display_order: 1 },
      { name: "3-6M", slug: "3-6m", price: 849, stock_quantity: 3, display_order: 2 },
    ]);
  });
  it("uses the product price when a variant price is null", () => {
    expect(coord.variants[0]?.price).toBe(1299);
    expect(coord.min_price).toBe(1199);
  });
  it("derives in_stock from row stock or any variant stock", () => {
    expect(frock.in_stock).toBe(true);
    expect(coord.in_stock).toBe(true);
    expect(jhabla.in_stock).toBe(false);
  });
  it("derives age slugs, category name, colours and rating", () => {
    expect(coord.age_slugs).toEqual(["3-4y", "4-5y", "3-6y"]);
    expect(frock.category).toBe("Frocks");
    expect(frock.colors).toEqual(["soft-pear"]);
    expect(frock.color_details).toEqual([{ slug: "soft-pear", name: "Soft Pear", hex: "#d9e8c5", base_color: "Green" }]);
    expect(frock.rating).toEqual({ average: 4.5, count: 2 });
    expect(jhabla.rating).toEqual({ average: 0, count: 0 });
    expect(frock.features).toEqual(["Pan collar", "Breathable"]);
    expect(frock.id).toBe(frock.slug);
  });
  it("derives base colour slugs from the reference, skipping prints without a base colour", () => {
    expect(frock.base_colors).toEqual(["green"]);
    expect(jhabla.base_colors).toEqual(["white"]);
    expect(coord.base_colors).toEqual([]);
    const unknownPrint = buildProductDoc({ ...frockRow, color_slugs: ["naugthy-nuts", "soft-pear", "not-a-print"] }, ctx);
    expect(unknownPrint.base_colors).toEqual(["green"]);
    expect(unknownPrint.color_details[2]).toEqual({ slug: "not-a-print", name: "Not A Print", hex: null, base_color: null });
  });
});

describe("toListCard", () => {
  it("keeps at most three images and drops detail-only fields", () => {
    const card = toListCard(buildProductDoc(frockRow, ctx));
    expect(card.images).toHaveLength(3);
    expect("variants" in card).toBe(false);
    expect("features" in card).toBe(false);
    expect(card.sizes[1]?.price).toBe(849);
    expect(card.base_colors).toEqual(["green"]);
  });
});

describe("sortDefault / mergeCards", () => {
  const cards = productRows.map((r) => toListCard(buildProductDoc(r, ctx)));
  it("sorts by created_at desc then slug asc", () => {
    expect(sortDefault(cards).map((c) => c.slug)).toEqual([
      "coords-set-chinese-collar-soft-pear",
      "frock-japanese-soft-pear",
      "jhabla-sleeveless-moons-and-stars",
    ]);
  });
  it("replaces, adds and deletes cards", () => {
    const updatedFrock = { ...cards[0]!, name: "Renamed" };
    const merged = mergeCards(cards, [updatedFrock], ["jhabla-sleeveless-moons-and-stars"]);
    expect(merged.map((c) => c.slug)).toEqual(["coords-set-chinese-collar-soft-pear", "frock-japanese-soft-pear"]);
    expect(merged.find((c) => c.slug === "frock-japanese-soft-pear")?.name).toBe("Renamed");
  });
});

describe("computeVersion / buildSnapshot", () => {
  const cards = productRows.map((r) => toListCard(buildProductDoc(r, ctx)));
  const now = new Date("2026-09-13T00:00:00.000Z");

  it("is stable for identical content regardless of key order and input order", () => {
    const a = computeVersion(cards, reference);
    const reordered = [...cards].reverse().map((c) => JSON.parse(JSON.stringify(c)) as typeof c);
    expect(computeVersion(sortDefault(reordered), reference)).toBe(a);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });
  it("changes when content changes", () => {
    const changed = cards.map((c) => (c.slug === frockRow.slug ? { ...c, price: 1 } : c));
    expect(computeVersion(changed, reference)).not.toBe(computeVersion(cards, reference));
  });
  it("returns the previous snapshot untouched when nothing changed", () => {
    const first = buildSnapshot(cards, reference, null, now);
    expect(first.changed).toBe(true);
    expect(first.snapshot.generatedAt).toBe(now.toISOString());
    const second = buildSnapshot(cards, reference, first.snapshot, new Date("2026-09-14T00:00:00.000Z"));
    expect(second.changed).toBe(false);
    expect(second.snapshot).toBe(first.snapshot);
  });
});
