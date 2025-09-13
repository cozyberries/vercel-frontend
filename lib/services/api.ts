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
  categoryId?: string;
  categoryName?: string;
  image?: string;
  is_featured?: boolean;
}

export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface PaginatedResponse<T> {
  products: T[];
  pagination: PaginationInfo;
}

// ---------- Axios Client ----------
const getBaseURL = () => {
  // Handle both client-side and server-side requests
  if (typeof window !== "undefined") {
    // Client-side: use current origin
    return window.location.origin;
  }
  // Server-side: use environment variable or default to localhost
  return process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: { "Content-Type": "application/json" },
  timeout: 10000, // 10 second timeout
});

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === 'ECONNABORTED') {
      console.error('Request timeout:', error.config.url);
    } else if (error.response?.status >= 500) {
      console.error('Server error:', error.response.status, error.config.url);
    } else if (!error.response) {
      console.error('Network error:', error.message, error.config.url);
    }
    return Promise.reject(error);
  }
);

// ---------- API Functions ----------
export const getCategories = async (retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const { data } = await api.get("/api/categories");
      return data || [];
    } catch (error) {
      console.error(`Error fetching categories (attempt ${i + 1}/${retries}):`, error);
      
      // If it's the last retry, return empty array
      if (i === retries - 1) {
        console.error("Failed to fetch categories after all retries");
        return [];
      }
      
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
  return [];
};

export const getBestsellers = async (): Promise<SimplifiedProduct[]> => {
  try {
    const { data } = await api.get("/api/products/bestsellers");
    return (data || []).map(normalizeProduct);
  } catch (error) {
    console.error("Error fetching bestsellers:", error);
    return [];
  }
};

export const getProductsByCategory = async (
  slug: string
): Promise<SimplifiedProduct[]> => {
  try {
    const { data } = await api.get("/api/products", {
      params: { categorySlug: slug },
    });
    return (data || []).map(normalizeProduct);
  } catch {
    return [];
  }
};

export const getAllProducts = async (params?: {
  sort?: string;
  type?: string;
}, retries = 3): Promise<SimplifiedProduct[]> => {
  for (let i = 0; i < retries; i++) {
    try {
      const { data } = await api.get("/api/products", {
        params: {
          ...params,
          limit: 100, // Maximum allowed by API
          page: 1,
        },
      });
      // The API returns { products: [...], pagination: {...} }
      return (data?.products || []).map(normalizeProduct);
    } catch (error) {
      console.error(`Error fetching products (attempt ${i + 1}/${retries}):`, error);
      
      // If it's the last retry, return empty array
      if (i === retries - 1) {
        console.error("Failed to fetch products after all retries");
        return [];
      }
      
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
  return [];
};

export const getPaginatedProducts = async (params?: {
  page?: number;
  limit?: number;
  category?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  bestseller?: boolean;
}): Promise<PaginatedResponse<SimplifiedProduct>> => {
  try {
    const { data } = await api.get("/api/products", {
      params: {
        page: params?.page || 1,
        limit: params?.limit || 12,
        category: params?.category,
        search: params?.search,
        sortBy: params?.sortBy || "created_at",
        sortOrder: params?.sortOrder || "desc",
        bestseller: params?.bestseller,
      },
    });

    return {
      products: (data.products || []).map(normalizeProduct),
      pagination: data.pagination || {
        currentPage: 1,
        totalPages: 1,
        totalItems: 0,
        itemsPerPage: 12,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };
  } catch (error) {
    console.error("Error fetching paginated products:", error);
    return {
      products: [],
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalItems: 0,
        itemsPerPage: 12,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };
  }
};

export const getProductById = async (id: string): Promise<Product | null> => {
  try {
    const { data } = await api.get(`/api/products/${id}`);

    const images: ProductImage[] = data.images?.map((img: any) => ({
      ...img,
      url: img.url || `/${img.storage_path}`,
    })) || [];

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
    const { data } = await api.get("/api/products", { params: { slug } });
    if (data?.id && Object.keys(data).length === 1) {
      return getProductById(data.id);
    }
    return data;
  } catch {
    return null;
  }
};

// ---------- CRUD Operations ----------

export interface ProductCreateRequest {
  name: string;
  description?: string;
  price: number;
  category?: string;
}

export interface ProductUpdateRequest {
  name?: string;
  description?: string;
  price?: number;
  category?: string;
}

export const createProduct = async (
  product: ProductCreateRequest
): Promise<Product | null> => {
  try {
    const { data } = await api.post("/api/products", product);
    return data;
  } catch (error) {
    console.error("Error creating product:", error);
    return null;
  }
};

export const updateProduct = async (
  id: string,
  product: ProductUpdateRequest
): Promise<Product | null> => {
  try {
    const { data } = await api.put(`/api/products/${id}`, product);
    return data;
  } catch (error) {
    console.error("Error updating product:", error);
    return null;
  }
};

export const deleteProduct = async (id: string): Promise<boolean> => {
  try {
    await api.delete(`/api/products/${id}`);
    return true;
  } catch (error) {
    console.error("Error deleting product:", error);
    return false;
  }
};
