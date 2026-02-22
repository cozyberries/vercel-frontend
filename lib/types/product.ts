export interface ProductImage {
  url: string;
  is_primary?: boolean;
  display_order?: number;
}

export interface ProductVariant {
  slug: string;
  price: number;
  stock_quantity: number;
  size: string;
  size_slug?: string;
  color?: string;
  color_slug?: string;
  color_hex?: string;
  display_order?: number;
}

export interface SizeOption {
  name: string;
  price: number;
  stock_quantity: number;
  display_order: number;
}

export interface RelatedProduct {
  slug: string;
  name: string;
  price: number;
  category: string;
  images: string[];
}

export interface SimplifiedProduct {
  id: string;
  name: string;
  slug?: string;
  price: number;
  description?: string;
  category?: string;
  images?: string[];
  is_featured?: boolean;
}

export interface ProductBase {
  name: string;
  description?: string;
  price: number;
  category?: string;
  images?: string[];
}

export interface ProductCreate extends ProductBase {}

export interface ProductUpdate {
  name?: string;
  description?: string;
  price?: number;
  category_slug?: string;
  stock_quantity?: number;
  is_featured?: boolean;
}

export interface Product extends ProductBase {
  id: string;
  created_at: string;
  updated_at?: string;
  slug?: string;
  stock_quantity?: number;
  is_featured?: boolean;
  category_slug?: string;
  gender_slug?: string;
  categories?: { name: string; slug: string };
  images?: string[];
  variants?: ProductVariant[];
  sizes?: SizeOption[];
}

export interface Category {
  slug: string;
  name: string;
  description?: string;
  image?: string;
}
