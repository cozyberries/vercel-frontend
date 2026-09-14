// Live option counts for the Filters sheet. Client-safe: no node or Next imports. Each option is
// counted as "the pending choices, with this group set to this option", using the same matching
// code the results grid uses, so a disabled option is exactly one that would show zero products.
import { applyFilters } from "./filter";
import type { Filters, ListCard } from "./types";

export type FacetGroup = "gender" | "age" | "design" | "colour";

/** What the shopper has tapped in the sheet so far (URL values when it opens). */
export type PendingSelection = Record<FacetGroup, string>;

export interface FacetOptions {
  /** Gender display names, as the chips use (the filter engine resolves them). */
  genders: string[];
  /** Age slugs, e.g. "0-3m", "3-6y". */
  ages: string[];
  /** Print slugs. */
  designs: string[];
  /** Base colour slugs. */
  colours: string[];
}

export type FacetCounts = Record<FacetGroup, Record<string, number>>;

export function facetCounts(cards: ListCard[], base: Filters, pending: PendingSelection, options: FacetOptions): FacetCounts {
  const withPending: Filters = { ...base, gender: pending.gender, age: pending.age, design: pending.design, colour: pending.colour };
  const countFor = (group: FacetGroup, value: string) => applyFilters(cards, { ...withPending, [group]: value }, null).length;
  const tally = (group: FacetGroup, values: string[]) =>
    Object.fromEntries(values.map((value) => [value, countFor(group, value)] as const));
  return {
    gender: tally("gender", options.genders),
    age: tally("age", options.ages),
    design: tally("design", options.designs),
    colour: tally("colour", options.colours),
  };
}

/**
 * An option is offered unless the counts say it yields nothing. The currently selected option is
 * always offered so it can be deselected, and unknown options (or no counts) stay enabled.
 */
export function isOptionAvailable(counts: FacetCounts | null, group: FacetGroup, value: string, selected: string): boolean {
  if (!counts) return true;
  if (value.toLowerCase() === selected.toLowerCase()) return true;
  const count = counts[group][value];
  return count === undefined || count > 0;
}
