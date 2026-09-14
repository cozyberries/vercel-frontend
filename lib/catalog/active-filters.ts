// Chips for the filters currently applied on /products. Client-safe: no node or Next imports.
// Category, search, sort and featured are excluded: category has its own chip row, search its
// own box, sort its own sheet, and featured has no UI control.
import { slugToTitle } from "@/lib/utils/product";
import { baseColourSlug } from "./colours";
import { resolveGenderSlugs } from "./filter";
import type { Filters, Reference } from "./types";

export type ActiveFilterParam = "gender" | "age" | "size" | "design" | "colour";

export interface ActiveFilterChip {
  /** URL parameter to delete when the chip is removed. */
  param: ActiveFilterParam;
  /** Group name as shown in the Filters sheet. */
  label: string;
  /** Human-readable value, resolved from the reference when possible. */
  value: string;
}

function genderName(value: string, reference: Reference): string {
  const wanted = resolveGenderSlugs(value)[0] ?? value.toLowerCase();
  const match = reference.genders.find((g) => g.slug === wanted || g.name.toLowerCase() === value.toLowerCase());
  return match?.name ?? slugToTitle(value);
}

function colourName(slug: string, reference: Reference): string {
  const match = reference.colors.find((c) => baseColourSlug(c.base_color) === slug);
  return match?.base_color?.trim() || slugToTitle(slug);
}

export function activeFilterChips(filters: Filters, reference: Reference): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (filters.gender !== "all") chips.push({ param: "gender", label: "Gender", value: genderName(filters.gender, reference) });
  if (filters.age !== "all") {
    const age = reference.ages.find((a) => a.slug === filters.age);
    chips.push({ param: "age", label: "Age", value: age?.name ?? slugToTitle(filters.age) });
  }
  if (filters.size !== "all") {
    const size = reference.sizes.find((s) => s.slug === filters.size || s.name.toLowerCase() === filters.size);
    chips.push({ param: "size", label: "Size", value: size?.name ?? slugToTitle(filters.size) });
  }
  if (filters.design !== "all") {
    const print = reference.colors.find((c) => c.slug === filters.design);
    chips.push({ param: "design", label: "Design", value: print?.name || slugToTitle(filters.design) });
  }
  if (filters.colour !== "all") chips.push({ param: "colour", label: "Colour", value: colourName(filters.colour, reference) });
  return chips;
}
