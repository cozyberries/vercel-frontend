import { describe, expect, it } from "vitest";
import { buildReference } from "./build";
import { referenceRows } from "./__fixtures__/catalog-rows";
import { DEFAULT_FILTERS } from "./filter";
import { activeFilterChips } from "./active-filters";

// Regression (2026-09-14): once the Filters sheet closed, nothing on the results screen showed
// which gender/age/design/colour was applied. Each active filter becomes a removable chip.

const reference = buildReference(referenceRows);

describe("activeFilterChips", () => {
  it("returns nothing for the default filters", () => {
    expect(activeFilterChips(DEFAULT_FILTERS, reference)).toEqual([]);
  });

  it("resolves each active filter to a labelled chip in a fixed order", () => {
    const chips = activeFilterChips(
      { ...DEFAULT_FILTERS, gender: "Girls", age: "3-6y", size: "0-3m", design: "soft-pear", colour: "green" },
      reference,
    );
    expect(chips).toEqual([
      { param: "gender", label: "Gender", value: "Girls" },
      { param: "age", label: "Age", value: "3-6 Years" },
      { param: "size", label: "Size", value: "0-3M" },
      { param: "design", label: "Design", value: "Soft Pear" },
      { param: "colour", label: "Colour", value: "Green" },
    ]);
  });

  it("falls back to a title-cased slug when the reference does not know the value", () => {
    const chips = activeFilterChips({ ...DEFAULT_FILTERS, design: "petal-pops", colour: "pale-yellow", gender: "boy" }, reference);
    expect(chips.map((c) => c.value)).toEqual(["Boys", "Petal Pops", "Pale Yellow"]);
  });

  it("ignores category, search, sort and featured, which have their own UI", () => {
    const chips = activeFilterChips({ ...DEFAULT_FILTERS, category: "frocks", search: "muslin", sortBy: "price", featured: true }, reference);
    expect(chips).toEqual([]);
  });
});
