// Client-safe draft state for the product form and the request bodies built from it.
import type { AdminProduct } from "./types";

export interface DraftSize {
  /** Existing variant slug; absent for a size added in this edit. */
  slug?: string;
  size_slug: string;
  size_name: string;
  price: string;
  stock: number;
  /** As loaded, so only real changes are sent and stock is sent with the count it started from. */
  start?: { price: number; stock: number };
}

export interface Draft {
  name: string;
  slug: string;
  description: string;
  care_instructions: string;
  category_slug: string;
  gender_slug: string;
  color_slug: string;
  features: string;
  sizes: DraftSize[];
}

export function draftFrom(product: AdminProduct): Draft {
  return {
    name: product.name,
    slug: product.slug,
    description: product.description,
    care_instructions: product.care_instructions,
    category_slug: product.category_slug ?? "",
    gender_slug: product.gender_slug ?? "",
    color_slug: product.color_slug ?? "",
    features: product.features.join("\n"),
    sizes: product.variants.map((v) => ({
      slug: v.slug,
      size_slug: v.size_slug,
      size_name: v.size_name,
      price: String(v.price),
      stock: v.stock_quantity,
      start: { price: v.price, stock: v.stock_quantity },
    })),
  };
}

export const EMPTY_DRAFT: Draft = {
  name: "",
  slug: "",
  description: "",
  care_instructions: "",
  category_slug: "",
  gender_slug: "",
  color_slug: "",
  features: "",
  sizes: [],
};

const featureList = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** A typed price that isn't a whole number is sent as NaN, so the server's message names the size. */
const priceOf = (text: string) => (/^\s*\d+\s*$/.test(text) ? Number(text) : Number.NaN);

function details(d: Draft) {
  return {
    name: d.name,
    description: d.description,
    care_instructions: d.care_instructions,
    category_slug: d.category_slug,
    gender_slug: d.gender_slug,
    features: featureList(d.features),
  };
}

/** PATCH body: details only if one changed, then each changed size and each added size. */
export function updateBody(product: AdminProduct, d: Draft) {
  const before = details(draftFrom(product));
  const after = details(d);
  const detailsChanged = JSON.stringify(before) !== JSON.stringify(after);

  const variants: Array<{ slug: string; price?: number; stock?: { from: number; to: number } }> = [];
  const add_sizes: Array<{ size_slug: string; price: number; stock: number }> = [];
  for (const s of d.sizes) {
    if (!s.slug || !s.start) {
      add_sizes.push({ size_slug: s.size_slug, price: priceOf(s.price), stock: s.stock });
      continue;
    }
    const change: (typeof variants)[number] = { slug: s.slug };
    const price = priceOf(s.price);
    if (price !== s.start.price) change.price = price;
    if (s.stock !== s.start.stock) change.stock = { from: s.start.stock, to: s.stock };
    if (change.price !== undefined || change.stock) variants.push(change);
  }
  return {
    ...(detailsChanged ? { details: after } : {}),
    variants,
    add_sizes,
  };
}

export function hasChanges(product: AdminProduct, d: Draft): boolean {
  const body = updateBody(product, d);
  return Boolean(body.details) || body.variants.length > 0 || body.add_sizes.length > 0;
}

/** POST body for a new product. */
export function createBody(d: Draft) {
  return {
    ...details(d),
    slug: d.slug.trim(),
    color_slug: d.color_slug,
    sizes: d.sizes.map((s) => ({ size_slug: s.size_slug, price: priceOf(s.price), stock: s.stock })),
  };
}

/** Sizes not on the product yet, in size-chart order. */
export function sizesToAdd(all: ReadonlyArray<{ slug: string; name: string }>, d: Draft) {
  const taken = new Set(d.sizes.map((s) => s.size_slug));
  return all.filter((s) => !taken.has(s.slug));
}

/** Adds a size in chart order, priced like the size before it (sizes usually share a price band). */
export function addSize(d: Draft, size: { slug: string; name: string }, order: readonly string[]): Draft {
  const rank = (slug: string) => order.indexOf(slug);
  const sizes = [...d.sizes, { size_slug: size.slug, size_name: size.name, price: "", stock: 0 }].sort((a, b) => rank(a.size_slug) - rank(b.size_slug));
  const i = sizes.findIndex((s) => s.size_slug === size.slug);
  const neighbour = sizes[i - 1] ?? sizes[i + 1];
  if (neighbour?.price) sizes[i] = { ...sizes[i], price: neighbour.price };
  return { ...d, sizes };
}

export function removeNewSize(d: Draft, sizeSlug: string): Draft {
  return { ...d, sizes: d.sizes.filter((s) => s.slug || s.size_slug !== sizeSlug) };
}
