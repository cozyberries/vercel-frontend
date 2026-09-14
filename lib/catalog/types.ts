// Shared types for the Redis-first catalog. Pure types only: safe to import from
// server code, client code and tests.

export type SortBy = "default" | "price" | "name";
export type SortOrder = "asc" | "desc";

/** Parsed /products URL filters. "all" means no constraint; search "" means none. */
export interface Filters {
  category: string;
  gender: string;
  size: string;
  age: string;
  /** Print slug from the `colors` table (e.g. "petal-pops"). Shown to shoppers as "Design". */
  design: string;
  /** Base colour slug derived from `colors.base_color` (e.g. "white", "lilac"). Shown as "Colour". */
  colour: string;
  search: string;
  sortBy: SortBy;
  sortOrder: SortOrder;
  featured: boolean;
}

export interface ReferenceCategory {
  slug: string;
  name: string;
  description: string | null;
  image: string | null;
  display: boolean;
}
export interface ReferenceGender {
  slug: string;
  name: string;
  display_order: number;
}
export interface ReferenceSize {
  slug: string;
  name: string;
  display_order: number;
}
/** An age option maps to one or more size slugs (e.g. "3-6y" → 3-4y, 4-5y, 5-6y). */
export interface ReferenceAge {
  slug: string;
  name: string;
  sizeSlugs: string[];
  display_order: number;
}
/** A print (e.g. "Petal Pops"); `base_color` is the actual clothing colour it sits on ("Beige"). */
export interface ReferenceColor {
  slug: string;
  name: string;
  hex: string | null;
  base_color: string | null;
}
export interface Reference {
  categories: ReferenceCategory[];
  genders: ReferenceGender[];
  sizes: ReferenceSize[];
  ages: ReferenceAge[];
  colors: ReferenceColor[];
}

/** Same shape as today's aggregated `sizes` entries, plus the size slug. */
export interface ProductSizeSummary {
  name: string;
  slug: string | null;
  price: number;
  stock_quantity: number;
  display_order: number;
}
/** Same shape as today's `ProductVariant` in lib/services/api.ts (null instead of undefined). */
export interface ProductVariantDoc {
  slug: string;
  price: number;
  stock_quantity: number;
  size: string | null;
  size_slug: string | null;
  color: string | null;
  color_slug: string | null;
  color_hex: string | null;
  display_order: number;
}
export interface ProductColorDetail {
  slug: string;
  name: string;
  hex: string | null;
  base_color: string | null;
}
export interface RatingSummary {
  average: number;
  count: number;
}

/** One product as the listing grid sees it. Matches today's /api/products items, plus additive fields. */
export interface ListCard {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  min_price: number;
  stock_quantity: number;
  in_stock: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
  category_slug: string;
  gender_slug: string;
  size_slugs: string[];
  color_slugs: string[];
  /** Base colour slugs of the product's prints (deduped), e.g. ["white"]. Drives the Colour filter. */
  base_colors: string[];
  age_slugs: string[];
  categories: { name: string; slug: string } | null;
  genders: { name: string; slug: string } | null;
  category: string;
  /** First three image URLs in display order. */
  images: string[];
  sizes: ProductSizeSummary[];
  /** Colour slugs, as today. */
  colors: string[];
}

/** Full product document stored at cat:product:{slug}. */
export interface ProductDoc extends Omit<ListCard, "images"> {
  /** All image URLs in display order. */
  images: string[];
  care_instructions: string;
  features: string[];
  variants: ProductVariantDoc[];
  color_details: ProductColorDetail[];
  rating: RatingSummary;
}

export interface Snapshot {
  /** sha1 content hash of products + reference (16 hex chars). */
  version: string;
  generatedAt: string;
  products: ListCard[];
  reference: Reference;
}

export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}
export interface ProductListResponse {
  products: ListCard[];
  pagination: PaginationInfo;
}

export type Scope =
  | { kind: "product"; slug: string }
  | { kind: "product-id"; id: string }
  | { kind: "reference" }
  | { kind: "full" };

export interface CatalogMeta {
  version: string | null;
  lastRebuildAt: string;
  scope: string;
  durationMs: number;
  ok: boolean;
  error?: string;
  productCount: number;
  indexDocCount: number | null;
}

export type CatalogSource = "redis" | "fallback";

// ── Supabase row shapes (what the selects in lib/catalog/supabase.ts return) ──

export interface ProductVariantRow {
  slug: string;
  price: number | null;
  stock_quantity: number | null;
  size_slug: string | null;
  color_slug: string | null;
  sizes: { slug: string; name: string; display_order: number | null } | null;
  colors: { slug: string; name: string; hex_code: string | null; base_color: string | null } | null;
}
export interface ProductRow {
  slug: string;
  name: string | null;
  description: string | null;
  price: number | null;
  care_instructions: string | null;
  stock_quantity: number | null;
  is_featured: boolean | null;
  created_at: string;
  updated_at: string | null;
  category_slug: string | null;
  gender_slug: string | null;
  size_slugs: string[] | null;
  color_slugs: string[] | null;
  categories: { name: string; slug: string } | null;
  genders: { name: string; slug: string } | null;
  product_images: Array<{ url: string | null; is_primary: boolean | null; display_order: number | null }> | null;
  product_features: Array<{ feature: string | null; display_order: number | null }> | null;
  product_variants: ProductVariantRow[] | null;
}
export interface CategoryRow {
  slug: string;
  name: string | null;
  description: string | null;
  image: string | null;
  display: boolean | null;
}
export interface GenderRow {
  slug: string;
  name: string | null;
  display_order: number | null;
}
export interface SizeRow {
  slug: string;
  name: string | null;
  display_order: number | null;
}
export interface ColorRow {
  slug: string;
  name: string | null;
  hex_code: string | null;
  base_color: string | null;
}
export interface RatingRow {
  product_slug: string;
  rating: number | null;
}
export interface ReferenceRows {
  categories: CategoryRow[];
  genders: GenderRow[];
  sizes: SizeRow[];
  colors: ColorRow[];
}
