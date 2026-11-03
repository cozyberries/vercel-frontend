// Shapes the /api/admin/products routes return to the editor (client-safe: types only).

export interface ProductListItem {
  slug: string;
  name: string;
  category_name: string | null;
  image: string | null;
  price: number;
  stock: number;
  sizes: number;
  photos: number;
}

export interface AdminVariant {
  slug: string;
  size_slug: string;
  size_name: string;
  price: number;
  stock_quantity: number;
}

export interface AdminProduct {
  slug: string;
  name: string;
  description: string;
  care_instructions: string;
  category_slug: string | null;
  gender_slug: string | null;
  color_slug: string | null;
  color_name: string | null;
  features: string[];
  images: string[];
  variants: AdminVariant[];
}

export interface ProductReference {
  categories: Array<{ slug: string; name: string }>;
  genders: Array<{ slug: string; name: string }>;
  sizes: Array<{ slug: string; name: string }>;
  colors: Array<{ slug: string; name: string; hex_code: string | null }>;
}

/** PATCH result: the sizes whose stock moved (a sale) while the admin was editing were left alone. */
export interface SaveResult {
  product: AdminProduct;
  conflicts: Array<{ size_name: string; stock_now: number }>;
}
