import type { ListCard, Snapshot } from "@/lib/catalog/types";

export const SUPABASE_PRODUCTS = "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/public/media/products";

/** A minimal in-stock ListCard whose first image is a Supabase product photo. */
export function displayCard(slug: string, overrides: Partial<ListCard> = {}): ListCard {
  return {
    id: slug,
    slug,
    name: `Name ${slug}`,
    description: "",
    price: 500,
    min_price: 500,
    stock_quantity: 5,
    in_stock: true,
    is_featured: false,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    category_slug: "frocks",
    gender_slug: "girl",
    size_slugs: [],
    color_slugs: [],
    base_colors: [],
    age_slugs: [],
    categories: null,
    genders: null,
    category: "frocks",
    images: [`${SUPABASE_PRODUCTS}/${slug}/1.jpg`, `${SUPABASE_PRODUCTS}/${slug}/2.jpg`],
    sizes: [],
    colors: [],
    ...overrides,
  };
}

export function displaySnapshot(products: ListCard[], version = "v1"): Snapshot {
  return {
    version,
    generatedAt: "2026-09-25T00:00:00.000Z",
    products,
    reference: { categories: [], genders: [], sizes: [], ages: [], colors: [] },
  };
}
