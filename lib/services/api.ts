import axios from "axios";
// import { normalizeProduct } from "@/utils/product";
import { normalizeProduct } from "@/lib/utils/product";
// ---------- Types ----------
export interface ProductVariant {
  id: string;
  sku: string;
  price: number;
  stock_quantity: number;
  size: string;
  color: string;
}

export interface ProductImage {
  id: string;
  storage_path: string;
  is_primary?: boolean;
  display_order?: number;
  url?: string;
}

export interface RelatedProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  image: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  care_instructions: string;
  stock_quantity: number;
  is_featured: boolean;
  category_id: string;
  category: string;
  features: string[];
  images: ProductImage[];
  colors: string[];
  sizes: string[];
  variants: ProductVariant[];
  relatedProducts?: RelatedProduct[];
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

// ---------- Axios Client ----------
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_SITE_URL || "https://api.cozyberries.in/",
  headers: { "Content-Type": "application/json" },
});

// ---------- API Functions ----------
export const getCategories = async () => {
  try {
    const { data } = await api.get("/api/categories");
    return data || [];
  } catch {
    return [];
  }
};

export const getFeaturedProducts = async (): Promise<SimplifiedProduct[]> => {
  try {
    const { data } = await api.get("/products");
    return (data || []).map(normalizeProduct);
  } catch (error) {
    console.log(error);
    return [];
  }
};

export const getProductsByCategory = async (
  slug: string
): Promise<SimplifiedProduct[]> => {
  try {
    const { data } = await api.get("/products", {
      params: { categorySlug: slug },
    });
    return (data || []).map(normalizeProduct);
  } catch {
    return [];
  }
};

export const getAllProducts = async (): Promise<SimplifiedProduct[]> => {
  try {
    const { data } = await api.get("/products");
    return (data || []).map(normalizeProduct);
  } catch {
    return [];
  }
};

export const getProductById = async (id: string): Promise<Product | null> => {
  try {
    const { data } = await api.get(`/products/${id}`);

    const images: ProductImage[] = data.images?.map((img: any) => ({
      ...img,
      url: img.url || img.storage_path || "/placeholder.jpg",
    })) || [
      {
        id: "default",
        storage_path: "",
        is_primary: true,
        display_order: 0,
        url: "/placeholder.jpg",
      },
    ];

    const variants: ProductVariant[] = (data.variants || []).map((v: any) => ({
      id: v.id,
      sku: v.sku,
      price: v.price,
      stock_quantity: v.stock_quantity,
      size: v.size,
      color: v.color,
    }));

    return {
      ...data,
      images,
      colors: [...new Set(variants.map((v) => v.color).filter(Boolean))],
      sizes: [...new Set(variants.map((v) => v.size).filter(Boolean))],
      variants,
      features: (data.features || []).map((f: any) => f.feature || f),
      relatedProducts: (data.relatedProducts || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        category: p.category,
        image: p.image || "/placeholder.jpg",
      })),
    };
  } catch {
    return null;
  }
};

export const getProductBySlug = async (
  slug: string
): Promise<Product | null> => {
  try {
    const { data } = await api.get("/products", { params: { slug } });
    if (data?.id && Object.keys(data).length === 1) {
      return getProductById(data.id);
    }
    return data;
  } catch {
    return null;
  }
};
