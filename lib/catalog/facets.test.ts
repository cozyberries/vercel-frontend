import { describe, expect, it } from "vitest";
import { buildProductDoc, buildReference, computeRatingSummaries, toListCard } from "./build";
import { productRows, ratingRows, referenceRows } from "./__fixtures__/catalog-rows";
import { DEFAULT_FILTERS } from "./filter";
import { facetCounts, isOptionAvailable, type FacetOptions, type PendingSelection } from "./facets";

// 2026-09-14: options in the Filters sheet are re-counted against the pending choices, so a
// combination that would return zero products is greyed out before the shopper applies it.

const reference = buildReference(referenceRows);
const cards = productRows.map((row) => toListCard(buildProductDoc(row, { reference, ratings: computeRatingSummaries(ratingRows) })));
// Fixture recap: frock = girl, sizes 0-3m/3-6m, print soft-pear (green);
//                coord = boy, sizes 3-4y/4-5y (→ 3-6y), no print; jhabla = unisex, 0-3m, moon-and-stars (white).

const options: FacetOptions = {
  genders: reference.genders.map((g) => g.name),
  ages: ["0-3m", "3-6m", "3-6y"],
  designs: ["soft-pear", "moon-and-stars"],
  colours: ["green", "white"],
};
const none: PendingSelection = { gender: "all", age: "all", design: "all", colour: "all" };

describe("facetCounts", () => {
  it("counts every option against the other pending choices", () => {
    const counts = facetCounts(cards, DEFAULT_FILTERS, none, options);
    expect(counts.age).toEqual({ "0-3m": 2, "3-6m": 1, "3-6y": 1 });
    expect(counts.colour).toEqual({ green: 1, white: 1 });
    expect(counts.gender).toEqual({ Unisex: 1, Girls: 2, Boys: 2 });
  });

  it("narrows the other groups once a choice is pending, but not the group being chosen from", () => {
    const counts = facetCounts(cards, DEFAULT_FILTERS, { ...none, colour: "green" }, options);
    // Only the green frock remains for the other groups…
    expect(counts.age).toEqual({ "0-3m": 1, "3-6m": 1, "3-6y": 0 });
    expect(counts.gender).toEqual({ Unisex: 0, Girls: 1, Boys: 0 });
    expect(counts.design).toEqual({ "soft-pear": 1, "moon-and-stars": 0 });
    // …while colours are still counted as if no colour were chosen, so switching stays possible.
    expect(counts.colour).toEqual({ green: 1, white: 1 });
  });

  it("respects filters the sheet does not own, such as the category chips and search", () => {
    const counts = facetCounts(cards, { ...DEFAULT_FILTERS, category: "frocks" }, none, options);
    expect(counts.colour).toEqual({ green: 1, white: 0 });
    const searched = facetCounts(cards, { ...DEFAULT_FILTERS, search: "jhabla" }, none, options);
    expect(searched.age).toEqual({ "0-3m": 1, "3-6m": 0, "3-6y": 0 });
  });
});

describe("isOptionAvailable", () => {
  it("disables zero-count options but never the one currently selected", () => {
    const counts = facetCounts(cards, DEFAULT_FILTERS, { ...none, colour: "green" }, options);
    expect(isOptionAvailable(counts, "age", "3-6y", "all")).toBe(false);
    expect(isOptionAvailable(counts, "age", "3-6y", "3-6y")).toBe(true);
    expect(isOptionAvailable(counts, "age", "0-3m", "all")).toBe(true);
  });
  it("treats an option the counts do not know as available", () => {
    const counts = facetCounts(cards, DEFAULT_FILTERS, none, options);
    expect(isOptionAvailable(counts, "design", "petal-pops", "all")).toBe(true);
    expect(isOptionAvailable(null, "design", "soft-pear", "all")).toBe(true);
  });
});
