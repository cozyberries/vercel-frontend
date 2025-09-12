export interface ProductImage {
  id: string;
  storage_path: string;
  is_primary?: boolean;
  display_order?: number;
  url?: string;
}

export interface ProductVariant {
  id: string;
  sku: string;
  price: number;
  stock_quantity: number;
  size: string;
  color: string;
}

export interface RelatedProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  image: string;
}

export interface SimplifiedProduct {
  id: string;
  name: string;
  slug?: string;
  price: number;
  description?: string;
  category?: string;
  image?: string;
}

export interface ProductBase {
  name: string;
  description?: string;
  price: number;
  category?: string;
}

export interface ProductCreate extends ProductBase {}

export interface ProductUpdate {
  name?: string;
  description?: string;
  price?: number;
  category?: string;
}

export interface Product extends ProductBase {
  id: string;
  created_at: string;
  updated_at?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
}
