// Chips for the filters currently applied on /products. Client-safe: no node or Next imports.
// Category, search, sort and featured are excluded: category has its own chip row, search its
// own box, sort its own sheet, and featured has no UI control.
import { slugToTitle } from "@/lib/utils/product";
import { baseColourSlug } from "./colours";
import { filterValues, resolveGenderSlugs } from "./filter";
import type { Filters, Reference } from "./types";

export type ActiveFilterParam = "gender" | "age" | "size" | "design" | "colour";

export interface ActiveFilterChip {
  /** URL parameter the chip's value sits in. */
  param: ActiveFilterParam;
  /** The value as it appears in that parameter's comma list; removing the chip drops just this one. */
  slug: string;
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
  const add = (param: ActiveFilterParam, label: string, name: (slug: string) => string) => {
    for (const slug of filterValues(filters[param])) chips.push({ param, label, value: name(slug), slug });
  };
  add("gender", "Gender", (slug) => genderName(slug, reference));
  add("age", "Age", (slug) => reference.ages.find((a) => a.slug === slug)?.name ?? slugToTitle(slug));
  add("size", "Size", (slug) => reference.sizes.find((s) => s.slug === slug || s.name.toLowerCase() === slug)?.name ?? slugToTitle(slug));
  add("design", "Design", (slug) => reference.colors.find((c) => c.slug === slug)?.name || slugToTitle(slug));
  add("colour", "Colour", (slug) => colourName(slug, reference));
  return chips;
}
