import type { ProductRow, RatingRow, ReferenceRows } from "../types";

export const referenceRows: ReferenceRows = {
  categories: [
    { slug: "frocks", name: "Frocks", description: "Muslin frocks", image: "https://img/frocks.jpg", display: true },
    { slug: "boys-coord-sets", name: "Boys Coord Sets", description: null, image: null, display: true },
    { slug: "jhabla", name: "Jhabla", description: null, image: null, display: true },
    { slug: "accessories", name: "Accessories", description: null, image: null, display: false },
  ],
  genders: [
    { slug: "boy", name: "Boys", display_order: 3 },
    { slug: "girl", name: "Girls", display_order: 2 },
    { slug: "unisex", name: "Unisex", display_order: 1 },
  ],
  sizes: [
    { slug: "0-3m", name: "0-3M", display_order: 1 },
    { slug: "3-6m", name: "3-6M", display_order: 2 },
    { slug: "3-4y", name: "3-4Y", display_order: 7 },
    { slug: "4-5y", name: "4-5Y", display_order: 8 },
    { slug: "5-6y", name: "5-6Y", display_order: 9 },
  ],
  colors: [
    { slug: "soft-pear", name: "Soft Pear", hex_code: "#d9e8c5", base_color: "Green" },
    { slug: "moon-and-stars", name: "Moon and Stars", hex_code: null, base_color: "White" },
    { slug: "naugthy-nuts", name: "Naugthy Nuts", hex_code: null, base_color: null },
  ],
};

export const frockRow: ProductRow = {
  slug: "frock-japanese-soft-pear",
  name: "Soft Pear - Japanese Muslin Frock",
  description: "Japanese pan collar frock in breathable muslin.",
  price: 899,
  care_instructions: "Machine wash cold",
  stock_quantity: 7,
  is_featured: false,
  created_at: "2026-05-02T10:00:00.000Z",
  updated_at: "2026-09-01T10:00:00.000Z",
  category_slug: "frocks",
  gender_slug: "girl",
  size_slugs: ["0-3m", "3-6m"],
  color_slugs: ["soft-pear"],
  categories: { name: "Frocks", slug: "frocks" },
  genders: { name: "Girls", slug: "girl" },
  product_images: [
    { url: "https://img/frock/2.jpg", is_primary: false, display_order: 2 },
    { url: "https://img/frock/1.jpg", is_primary: true, display_order: 1 },
    { url: "https://img/frock/3.jpg", is_primary: false, display_order: 3 },
    { url: "https://img/frock/4.jpg", is_primary: false, display_order: 4 },
  ],
  product_features: [
    { feature: "Breathable", display_order: 2 },
    { feature: "Pan collar", display_order: 1 },
  ],
  product_variants: [
    {
      slug: "frock-japanese-soft-pear-0-3m",
      price: 899,
      stock_quantity: 4,
      size_slug: "0-3m",
      color_slug: "soft-pear",
      sizes: { slug: "0-3m", name: "0-3M", display_order: 1 },
      colors: { slug: "soft-pear", name: "Soft Pear", hex_code: "#d9e8c5", base_color: "Green" },
    },
    {
      slug: "frock-japanese-soft-pear-3-6m",
      price: 849,
      stock_quantity: 3,
      size_slug: "3-6m",
      color_slug: "soft-pear",
      sizes: { slug: "3-6m", name: "3-6M", display_order: 2 },
      colors: { slug: "soft-pear", name: "Soft Pear", hex_code: "#d9e8c5", base_color: "Green" },
    },
  ],
};

export const coordRow: ProductRow = {
  slug: "coords-set-chinese-collar-soft-pear",
  name: "Petal Pops - Boys Co ord set",
  description: "Chinese collar shirt and shorts set.",
  price: 1299,
  care_instructions: null,
  stock_quantity: 0,
  is_featured: true,
  created_at: "2026-06-10T10:00:00.000Z",
  updated_at: null,
  category_slug: "boys-coord-sets",
  gender_slug: "boy",
  size_slugs: ["3-4y", "4-5y"],
  color_slugs: [],
  categories: { name: "Boys Coord Sets", slug: "boys-coord-sets" },
  genders: { name: "Boys", slug: "boy" },
  product_images: [{ url: "https://img/coord/1.jpg", is_primary: true, display_order: 1 }],
  product_features: null,
  product_variants: [
    {
      slug: "coord-3-4y",
      price: null,
      stock_quantity: 0,
      size_slug: "3-4y",
      color_slug: null,
      sizes: { slug: "3-4y", name: "3-4Y", display_order: 7 },
      colors: null,
    },
    {
      slug: "coord-4-5y",
      price: 1199,
      stock_quantity: 2,
      size_slug: "4-5y",
      color_slug: null,
      sizes: { slug: "4-5y", name: "4-5Y", display_order: 8 },
      colors: null,
    },
  ],
};

export const jhablaRow: ProductRow = {
  slug: "jhabla-sleeveless-moons-and-stars",
  name: "Moons and Stars Jhabla",
  description: "Sleeveless jhabla.",
  price: 499,
  care_instructions: null,
  stock_quantity: 0,
  is_featured: true,
  created_at: "2026-01-15T10:00:00.000Z",
  updated_at: null,
  category_slug: "jhabla",
  gender_slug: "unisex",
  size_slugs: ["0-3m"],
  color_slugs: ["moon-and-stars"],
  categories: { name: "Jhabla", slug: "jhabla" },
  genders: { name: "Unisex", slug: "unisex" },
  product_images: [],
  product_features: [],
  product_variants: [],
};

export const productRows: ProductRow[] = [frockRow, coordRow, jhablaRow];

export const ratingRows: RatingRow[] = [
  { product_slug: "frock-japanese-soft-pear", rating: 5 },
  { product_slug: "frock-japanese-soft-pear", rating: 4 },
  { product_slug: "coords-set-chinese-collar-soft-pear", rating: null },
];
