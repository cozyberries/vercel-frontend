// Design (print) and Colour (base colour) filter options, derived from the catalog. Client-safe:
// no node or Next imports. A "print" is a row of the `colors` table ("Petal Pops"); its
// `base_color` is the actual clothing colour the print sits on ("Beige").
import { slugToTitle } from "@/lib/utils/product";
import type { ListCard, Reference } from "./types";

/** Swatch hex per base colour slug. Slightly off pure white so the swatch reads against the sheet. */
export const BASE_COLOUR_SWATCHES: Record<string, string> = {
  white: "#f7f5f0",
  cream: "#f3eac8",
  beige: "#e3c79e",
  peach: "#f4cbaf",
  pink: "#f4cfcb",
  lilac: "#dccbe3",
  green: "#c9ddb5",
};
export const FALLBACK_SWATCH = "#e5e1da";

export interface DesignOption {
  slug: string;
  name: string;
}
export interface ColourOption {
  slug: string;
  name: string;
  hex: string;
}

/** "Pale Yellow" → "pale-yellow". Empty for null/blank so callers can filter it out. */
export function baseColourSlug(name: string | null | undefined): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name);
}

/** Prints used by at least one card, named from the reference (or the slug when unknown). */
export function designOptionsFor(reference: Reference, cards: ListCard[]): DesignOption[] {
  const nameBySlug = new Map(reference.colors.map((c) => [c.slug, c.name]));
  const used = new Set(cards.flatMap((card) => card.color_slugs ?? []));
  return [...used].map((slug) => ({ slug, name: nameBySlug.get(slug) || slugToTitle(slug) })).sort(byName);
}

/** Base colours present on at least one card, with a display name and swatch hex. */
export function colourOptionsFor(reference: Reference, cards: ListCard[]): ColourOption[] {
  const nameBySlug = new Map<string, string>();
  for (const c of reference.colors) {
    const slug = baseColourSlug(c.base_color);
    if (slug !== "" && c.base_color) nameBySlug.set(slug, c.base_color.trim());
  }
  const used = new Set(cards.flatMap((card) => card.base_colors ?? []));
  return [...used]
    .map((slug) => ({ slug, name: nameBySlug.get(slug) || slugToTitle(slug), hex: BASE_COLOUR_SWATCHES[slug] ?? FALLBACK_SWATCH }))
    .sort(byName);
}
