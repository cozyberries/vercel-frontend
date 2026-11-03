// Pure rules for the /admin/products editor: request validation, slugs and the product-level
// roll-up (price, base_price, stock) that the catalog reads alongside the variants.
import { GST_LOW_RATE_MAX_UNIT_PRICE } from "@/lib/config/business";
import renamed from "@/lib/catalog/renamed-products.json";

export const MAX_STOCK = 9999;
export const MAX_FEATURES = 12;
export const LIMITS = { name: 120, description: 2000, care: 1000, feature: 200 } as const;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface SizeInput {
  size_slug: string;
  price: number;
  stock: number;
}

/** A stock change carries the count the admin started from, so a sale confirmed meanwhile is never overwritten. */
export interface VariantChange {
  slug: string;
  price?: number;
  stock?: { from: number; to: number };
}

export interface DetailsInput {
  name: string;
  description: string;
  care_instructions: string;
  category_slug: string;
  gender_slug: string;
  features: string[];
}

export interface ProductUpdate {
  details?: DetailsInput;
  variants: VariantChange[];
  add_sizes: SizeInput[];
}

export interface NewProductInput extends DetailsInput {
  slug: string;
  color_slug: string;
  sizes: SizeInput[];
}

/** What the request may name: the server fills these from the live reference tables. */
export interface KnownSlugs {
  categories: ReadonlySet<string>;
  genders: ReadonlySet<string>;
  sizes: ReadonlySet<string>;
  colors: ReadonlySet<string>;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** Prices are what the customer pays, GST included; base_price is the same price before 5% GST. */
export function basePriceFor(price: number): number {
  return Math.round(price / 1.05);
}

/** The product row mirrors its sizes: cheapest price and total stock (the catalog's in-stock test reads both). */
export function productRollup(variants: ReadonlyArray<{ price: number | null; stock_quantity: number | null }>) {
  const prices = variants.map((v) => Number(v.price ?? 0)).filter((p) => p > 0);
  const price = prices.length ? Math.min(...prices) : 0;
  const stock_quantity = variants.reduce((sum, v) => sum + Math.max(0, Number(v.stock_quantity ?? 0)), 0);
  return { price, base_price: basePriceFor(price), stock_quantity };
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Every variant slug is product-size-print (migration 20261010140000). */
export function variantSlug(productSlug: string, sizeSlug: string, colorSlug: string): string {
  return `${productSlug}-${sizeSlug}-${colorSlug}`;
}

/** Old product slugs still 308 to their new ones, so a new product must not take one. */
export function isRetiredSlug(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call((renamed as { products: Record<string, string> }).products, slug);
}

function text(value: unknown, label: string, max: number, required = false): Result<string> {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") return fail(`${label} must be text`);
  const trimmed = value.trim();
  if (required && !trimmed) return fail(`${label} is required`);
  if (trimmed.length > max) return fail(`${label} is too long (at most ${max} characters)`);
  return { ok: true, value: trimmed };
}

export function checkPrice(value: unknown, label: string): Result<number> {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return fail(`${label}: price must be a whole number of rupees`);
  if (value > GST_LOW_RATE_MAX_UNIT_PRICE) {
    return fail(`${label}: price can't be above ₹${GST_LOW_RATE_MAX_UNIT_PRICE.toLocaleString("en-IN")} (clothing above that is 18% GST)`);
  }
  return { ok: true, value };
}

export function checkStock(value: unknown, label: string): Result<number> {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_STOCK) {
    return fail(`${label}: stock must be a whole number from 0 to ${MAX_STOCK}`);
  }
  return { ok: true, value };
}

function parseDetails(raw: Record<string, unknown>, known: KnownSlugs): Result<DetailsInput> {
  const name = text(raw.name, "Name", LIMITS.name, true);
  if (!name.ok) return name;
  const description = text(raw.description, "Description", LIMITS.description);
  if (!description.ok) return description;
  const care = text(raw.care_instructions, "Care instructions", LIMITS.care);
  if (!care.ok) return care;
  if (typeof raw.category_slug !== "string" || !known.categories.has(raw.category_slug)) return fail("Pick a category");
  if (typeof raw.gender_slug !== "string" || !known.genders.has(raw.gender_slug)) return fail("Pick who it's for");
  const rawFeatures = raw.features ?? [];
  if (!Array.isArray(rawFeatures)) return fail("Features must be a list");
  const features: string[] = [];
  for (const f of rawFeatures) {
    const feature = text(f, "Each feature", LIMITS.feature);
    if (!feature.ok) return feature;
    if (feature.value) features.push(feature.value);
  }
  if (features.length > MAX_FEATURES) return fail(`At most ${MAX_FEATURES} features`);
  return {
    ok: true,
    value: {
      name: name.value,
      description: description.value,
      care_instructions: care.value,
      category_slug: raw.category_slug,
      gender_slug: raw.gender_slug,
      features,
    },
  };
}

function parseSizes(raw: unknown, known: KnownSlugs, taken: ReadonlySet<string>): Result<SizeInput[]> {
  if (raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return fail("Sizes must be a list");
  const seen = new Set(taken);
  const sizes: SizeInput[] = [];
  for (const s of raw as Array<Record<string, unknown>>) {
    const size = s?.size_slug;
    if (typeof size !== "string" || !known.sizes.has(size)) return fail("Unknown size");
    if (seen.has(size)) return fail(`Size ${size.toUpperCase()} is listed twice`);
    seen.add(size);
    const price = checkPrice(s.price, size.toUpperCase());
    if (!price.ok) return price;
    const stock = checkStock(s.stock, size.toUpperCase());
    if (!stock.ok) return stock;
    sizes.push({ size_slug: size, price: price.value, stock: stock.value });
  }
  return { ok: true, value: sizes };
}

/** PATCH body for an existing product. `current` is the product's variant slug → size slug. */
export function parseProductUpdate(body: unknown, known: KnownSlugs, current: ReadonlyMap<string, string>): Result<ProductUpdate> {
  if (!body || typeof body !== "object") return fail("Invalid request");
  const raw = body as Record<string, unknown>;

  let details: DetailsInput | undefined;
  if (raw.details !== undefined) {
    if (!raw.details || typeof raw.details !== "object") return fail("Invalid details");
    const parsed = parseDetails(raw.details as Record<string, unknown>, known);
    if (!parsed.ok) return parsed;
    details = parsed.value;
  }

  const rawVariants = raw.variants ?? [];
  if (!Array.isArray(rawVariants)) return fail("Invalid sizes");
  const variants: VariantChange[] = [];
  const seen = new Set<string>();
  for (const v of rawVariants as Array<Record<string, unknown>>) {
    const slug = v?.slug;
    if (typeof slug !== "string" || !current.has(slug)) return fail("That size isn't part of this product");
    if (seen.has(slug)) return fail("A size is listed twice");
    seen.add(slug);
    const label = (current.get(slug) ?? slug).toUpperCase();
    const change: VariantChange = { slug };
    if (v.price !== undefined) {
      const price = checkPrice(v.price, label);
      if (!price.ok) return price;
      change.price = price.value;
    }
    if (v.stock !== undefined) {
      const s = v.stock as Record<string, unknown> | null;
      const from = checkStock(s?.from, label);
      const to = checkStock(s?.to, label);
      if (!from.ok) return from;
      if (!to.ok) return to;
      if (from.value !== to.value) change.stock = { from: from.value, to: to.value };
    }
    if (change.price !== undefined || change.stock) variants.push(change);
  }

  const add = parseSizes(raw.add_sizes, known, new Set(current.values()));
  if (!add.ok) return add;

  if (!details && !variants.length && !add.value.length) return fail("Nothing to save");
  return { ok: true, value: { details, variants, add_sizes: add.value } };
}

/** POST body for a new product. The slug defaults to one made from the name. */
export function parseNewProduct(body: unknown, known: KnownSlugs): Result<NewProductInput> {
  if (!body || typeof body !== "object") return fail("Invalid request");
  const raw = body as Record<string, unknown>;
  const details = parseDetails(raw, known);
  if (!details.ok) return details;

  const slug = typeof raw.slug === "string" && raw.slug.trim() ? raw.slug.trim().toLowerCase() : slugify(details.value.name);
  if (!SLUG_RE.test(slug) || slug.length > 80) return fail("Web address can use only a-z, 0-9 and single dashes");
  if (isRetiredSlug(slug)) return fail("That web address belonged to a renamed product; pick another");
  // /admin/products/new is the add-product page.
  if (slug === "new") return fail("Pick a longer web address");

  if (typeof raw.color_slug !== "string" || !known.colors.has(raw.color_slug)) return fail("Pick a print");

  const sizes = parseSizes(raw.sizes, known, new Set());
  if (!sizes.ok) return sizes;
  if (!sizes.value.length) return fail("Add at least one size");

  return { ok: true, value: { ...details.value, slug, color_slug: raw.color_slug, sizes: sizes.value } };
}
