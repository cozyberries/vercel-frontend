import type { ProductDoc, ProductVariantDoc } from "@/lib/catalog/types";
import type { ExistingRow } from "../mapping";

function variant(sizeSlug: string, size: string, price: number, stock: number): ProductVariantDoc {
  return {
    slug: `coords-set-chinese-collar-soft-pear-${sizeSlug}-petal-pops`,
    price,
    stock_quantity: stock,
    size,
    size_slug: sizeSlug,
    color: "Petal Pops",
    color_slug: "petal-pops",
    color_hex: null,
    display_order: 1,
  };
}

export const comboProduct = {
  id: "1",
  slug: "coords-set-chinese-collar-soft-pear",
  name: "Petal Pops - Boys Co ord set",
  description: "Chinese collar shirt and shorts muslin co-ord set crafted for everyday comfort.",
  price: 839,
  min_price: 839,
  stock_quantity: 25,
  in_stock: true,
  is_featured: false,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  category_slug: "boys-coord-sets",
  gender_slug: "boy",
  size_slugs: ["6-12m", "1-2y"],
  color_slugs: ["petal-pops"],
  base_colors: ["beige"],
  age_slugs: [],
  categories: { name: "Boys Coord Sets", slug: "boys-coord-sets" },
  genders: { name: "Boy", slug: "boy" },
  category: "Boys Coord Sets",
  // Five, so tests can prove the mapping takes only the first four.
  images: [
    "https://cdn.example/1.jpg",
    "https://cdn.example/2.jpg",
    "https://cdn.example/3.jpg",
    "https://cdn.example/4.jpg",
    "https://cdn.example/5.jpg",
  ],
  care_instructions: "",
  features: ["Lightweight muslin fabric", "Charming prints"],
  variants: [variant("6-12m", "6-12M", 839, 10), variant("1-2y", "1-2Y", 839, 15)],
  color_details: [{ slug: "petal-pops", name: "Petal Pops", hex: null, base_color: "beige" }],
  rating: { average: 0, count: 0 },
} as unknown as ProductDoc;

/** Frocks are single garments — a different Flipkart vertical. */
export const singleGarmentProduct = {
  ...comboProduct,
  slug: "frock-japanese-petal-pops",
  category_slug: "frocks",
} as unknown as ProductDoc;

export const existingRow: ExistingRow = {
  rowIndex: 11,
  sku: "Coords Set Chinese Collar - Soft Pear",
  images: [
    "http://img1a.flixcart.com/fk-p-images-internalise/main",
    "http://img1a.flixcart.com/fk-p-images-internalise/back",
    "http://img1a.flixcart.com/fk-p-images-internalise/side",
  ],
};
