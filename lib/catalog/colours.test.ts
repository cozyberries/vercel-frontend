import { describe, expect, it } from "vitest";
import { buildProductDoc, buildReference, computeRatingSummaries, toListCard } from "./build";
import { productRows, ratingRows, referenceRows } from "./__fixtures__/catalog-rows";
import { BASE_COLOUR_SWATCHES, FALLBACK_SWATCH, baseColourSlug, colourOptionsFor, designOptionsFor } from "./colours";

// Regression (2026-09-14): the Design and Colour filter groups were hardcoded placeholders
// (Solid/Stripe/Polka…, Sage/Oat/Clay…) that matched no product, so picking one changed nothing.
// Options must now come from the catalog: prints for Design, the prints' base colours for Colour.

const reference = buildReference(referenceRows);
const ratings = computeRatingSummaries(ratingRows);
const cards = productRows.map((row) => toListCard(buildProductDoc(row, { reference, ratings })));

describe("baseColourSlug", () => {
  it("lowercases, trims and hyphenates so 'Pale Yellow' and ' pale  yellow ' agree", () => {
    expect(baseColourSlug("Pale Yellow")).toBe("pale-yellow");
    expect(baseColourSlug(" pale  yellow ")).toBe("pale-yellow");
    expect(baseColourSlug(null)).toBe("");
  });
});

describe("designOptionsFor", () => {
  it("lists only prints that at least one product uses, sorted by name", () => {
    expect(designOptionsFor(reference, cards)).toEqual([
      { slug: "moon-and-stars", name: "Moon and Stars" },
      { slug: "soft-pear", name: "Soft Pear" },
    ]);
  });
  it("names a print the storefront has never heard of from its slug", () => {
    const stray = { ...cards[0]!, color_slugs: ["petal-pops"] };
    expect(designOptionsFor(reference, [stray])).toEqual([{ slug: "petal-pops", name: "Petal Pops" }]);
  });
});

describe("colourOptionsFor", () => {
  it("lists the base colours present on products with a swatch hex, sorted by name", () => {
    expect(colourOptionsFor(reference, cards)).toEqual([
      { slug: "green", name: "Green", hex: BASE_COLOUR_SWATCHES.green },
      { slug: "white", name: "White", hex: BASE_COLOUR_SWATCHES.white },
    ]);
  });
  it("falls back to a neutral swatch and a title-cased name for colours outside the palette", () => {
    const stray = { ...cards[0]!, base_colors: ["pale-yellow"] };
    expect(colourOptionsFor(reference, [stray])).toEqual([{ slug: "pale-yellow", name: "Pale Yellow", hex: FALLBACK_SWATCH }]);
  });
  it("ignores cards built before base colours existed", () => {
    const legacy = { ...cards[0]!, base_colors: undefined } as unknown as (typeof cards)[number];
    expect(colourOptionsFor(reference, [legacy])).toEqual([]);
  });
});
