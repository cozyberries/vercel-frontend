// Pure builders: Supabase rows → catalog documents. No I/O. Uses node:crypto for the
// version hash, so this module is server/test only (never imported by client code).
import { createHash } from "node:crypto";
import { slugToTitle } from "@/lib/utils/product";
import type {
  ListCard,
  ProductDoc,
  ProductRow,
  ProductSizeSummary,
  ProductVariantDoc,
  RatingRow,
  RatingSummary,
  Reference,
  ReferenceAge,
  ReferenceRows,
  Snapshot,
} from "./types";

/** Age groups that span several size slugs. The storefront shows "3-6y" as one option. */
export const AGE_GROUPS: ReferenceAge[] = [
  { slug: "3-6y", name: "3-6 Years", sizeSlugs: ["3-4y", "4-5y", "5-6y"], display_order: 1000 },
];
const AGE_ALIASES: Record<string, string> = { "3-6-years": "3-6y" };
/** Fixed gender display order used by the legacy /api/genders/options route. */
const GENDER_ORDER = ["unisex", "girl", "girls", "boy", "boys"];

export function normalizeSlug(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeAgeSlug(age: string): string {
  const slug = normalizeSlug(age);
  return AGE_ALIASES[slug] ?? slug;
}

function genderRank(name: string): number {
  const index = GENDER_ORDER.indexOf(name.toLowerCase());
  return index === -1 ? 999 : index;
}

export function buildReference(rows: ReferenceRows): Reference {
  const categories = rows.categories
    .filter((c) => c.display !== false && normalizeSlug(c.slug) !== "")
    .map((c) => ({
      slug: normalizeSlug(c.slug),
      name: c.name ?? "",
      description: c.description ?? null,
      image: c.image ?? null,
      display: true,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const genders = rows.genders
    .filter((g) => normalizeSlug(g.slug) !== "")
    .map((g) => ({ slug: normalizeSlug(g.slug), name: g.name ?? "", display_order: Number(g.display_order ?? 0) }))
    .sort((a, b) => genderRank(a.name) - genderRank(b.name));

  const sizes = rows.sizes
    .filter((s) => normalizeSlug(s.slug) !== "")
    .map((s) => ({ slug: normalizeSlug(s.slug), name: s.name ?? "", display_order: Number(s.display_order ?? 0) }))
    .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));

  const ages: ReferenceAge[] = [
    ...sizes.map((s) => ({ slug: s.slug, name: s.name, sizeSlugs: [s.slug], display_order: s.display_order })),
    ...AGE_GROUPS,
  ];

  const colors = rows.colors
    .filter((c) => normalizeSlug(c.slug) !== "")
    .map((c) => ({ slug: normalizeSlug(c.slug), name: c.name ?? "", hex: c.hex_code ?? null }));

  return { categories, genders, sizes, ages, colors };
}

export function deriveAgeSlugs(sizeSlugs: string[], reference: Reference): string[] {
  const have = new Set(sizeSlugs.map(normalizeSlug));
  return reference.ages.filter((age) => age.sizeSlugs.some((s) => have.has(s))).map((age) => age.slug);
}

export function computeRatingSummaries(rows: RatingRow[]): Record<string, RatingSummary> {
  const acc: Record<string, { sum: number; count: number }> = {};
  for (const row of rows) {
    const rating = Number(row.rating);
    if (!row.product_slug || row.rating === null || !Number.isFinite(rating)) continue;
    const entry = (acc[row.product_slug] ??= { sum: 0, count: 0 });
    entry.sum += rating;
    entry.count += 1;
  }
  const out: Record<string, RatingSummary> = {};
  for (const [slug, entry] of Object.entries(acc)) {
    out[slug] = { average: Math.round((entry.sum / entry.count) * 10) / 10, count: entry.count };
  }
  return out;
}

function orderedImages(row: ProductRow): string[] {
  return [...(row.product_images ?? [])]
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((image) => image.url ?? "")
    .filter((url) => url !== "");
}

function orderedFeatures(row: ProductRow): string[] {
  return [...(row.product_features ?? [])]
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((f) => f.feature ?? "")
    .filter((f) => f !== "");
}

function buildVariants(row: ProductRow): ProductVariantDoc[] {
  const fallbackPrice = Number(row.price ?? 0);
  return (row.product_variants ?? [])
    .map((v) => ({
      slug: v.slug,
      price: Number(v.price ?? fallbackPrice),
      stock_quantity: Number(v.stock_quantity ?? 0),
      size: v.sizes?.name ?? null,
      size_slug: normalizeSlug(v.size_slug ?? v.sizes?.slug) || null,
      color: v.colors?.name ?? null,
      color_slug: normalizeSlug(v.color_slug ?? v.colors?.slug) || null,
      color_hex: v.colors?.hex_code ?? null,
      display_order: Number(v.sizes?.display_order ?? 0),
    }))
    .sort((a, b) => a.display_order - b.display_order);
}

/** Same rule as lib/utils/product.ts aggregateSizesFromVariants: dedupe by size name, sum stock, keep lowest price. */
function aggregateSizes(variants: ProductVariantDoc[]): ProductSizeSummary[] {
  const bySize = new Map<string, ProductSizeSummary>();
  for (const v of variants) {
    if (!v.size) continue;
    const existing = bySize.get(v.size);
    if (!existing) {
      bySize.set(v.size, {
        name: v.size,
        slug: v.size_slug,
        price: v.price,
        stock_quantity: v.stock_quantity,
        display_order: v.display_order,
      });
    } else {
      existing.stock_quantity += v.stock_quantity;
      existing.price = Math.min(existing.price, v.price);
    }
  }
  return [...bySize.values()].sort((a, b) => a.display_order - b.display_order);
}

export function buildProductDoc(
  row: ProductRow,
  ctx: { reference: Reference; ratings: Record<string, RatingSummary> },
): ProductDoc {
  const slug = normalizeSlug(row.slug);
  const variants = buildVariants(row);
  const price = Number(row.price ?? 0);
  const variantPrices = variants.map((v) => v.price).filter((p) => p > 0);
  const stock_quantity = Number(row.stock_quantity ?? 0);
  const size_slugs = (row.size_slugs ?? []).map(normalizeSlug).filter((s) => s !== "");
  const color_slugs = (row.color_slugs ?? []).map(normalizeSlug).filter((s) => s !== "");
  const colorBySlug = new Map(ctx.reference.colors.map((c) => [c.slug, c]));

  return {
    id: slug,
    slug,
    name: row.name ?? "",
    description: row.description ?? "",
    price,
    min_price: variantPrices.length > 0 ? Math.min(...variantPrices) : price,
    stock_quantity,
    in_stock: stock_quantity > 0 || variants.some((v) => v.stock_quantity > 0),
    is_featured: row.is_featured === true,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    category_slug: normalizeSlug(row.category_slug),
    gender_slug: normalizeSlug(row.gender_slug),
    size_slugs,
    color_slugs,
    age_slugs: deriveAgeSlugs(size_slugs, ctx.reference),
    categories: row.categories ?? null,
    genders: row.genders ?? null,
    category: row.categories?.name ?? "",
    images: orderedImages(row),
    sizes: aggregateSizes(variants),
    colors: color_slugs,
    care_instructions: row.care_instructions ?? "",
    features: orderedFeatures(row),
    variants,
    color_details: color_slugs.map(
      (s) => colorBySlug.get(s) ?? { slug: s, name: slugToTitle(s), hex: null },
    ),
    rating: ctx.ratings[slug] ?? { average: 0, count: 0 },
  };
}

export function toListCard(doc: ProductDoc): ListCard {
  const { care_instructions: _care, features: _features, variants: _variants, color_details: _colors, rating: _rating, ...card } = doc;
  return { ...card, images: doc.images.slice(0, 3) };
}

export function sortDefault<T extends { created_at: string; slug: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.created_at.localeCompare(a.created_at) || a.slug.localeCompare(b.slug));
}

export function mergeCards(previous: ListCard[], updated: ListCard[], deleteSlugs: string[]): ListCard[] {
  const deleted = new Set(deleteSlugs);
  const bySlug = new Map(previous.filter((c) => !deleted.has(c.slug)).map((c) => [c.slug, c] as const));
  for (const card of updated) bySlug.set(card.slug, card);
  return sortDefault([...bySlug.values()]);
}

/** Deterministic JSON with sorted object keys, so equal content hashes equal. */
export function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const body = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`)
      .join(",");
    return `{${body}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function computeVersion(products: ListCard[], reference: Reference): string {
  // Sorted first so the version depends on content only, never on input order.
  return createHash("sha1").update(canonicalStringify({ products: sortDefault(products), reference })).digest("hex").slice(0, 16);
}

export function buildSnapshot(
  products: ListCard[],
  reference: Reference,
  previous: Snapshot | null,
  now: Date,
): { snapshot: Snapshot; changed: boolean } {
  const ordered = sortDefault(products);
  const version = computeVersion(ordered, reference);
  if (previous && previous.version === version) return { snapshot: previous, changed: false };
  return { snapshot: { version, generatedAt: now.toISOString(), products: ordered, reference }, changed: true };
}
