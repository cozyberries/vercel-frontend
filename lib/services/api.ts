import axios from "axios";
import { normalizeProduct } from "@/lib/utils/product";
// ---------- Types ----------
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
  stock_quantity: number | undefined;
  display_order: number;
}

export interface ProductImage {
  url: string;
  is_primary?: boolean;
  display_order?: number;
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
  category_slug: string;
  category: string;
  categories: { name: string; slug: string };
  features: string[];
  images: string[];
  colors: string[];
  sizes: SizeOption[];
  variants: ProductVariant[];
  RelatedProduct?: RelatedProduct[];
}

export interface SimplifiedProduct {
  id: string;
  name: string;
  slug?: string;
  price: number;
  description?: string;
  category?: string;
  categorySlug?: string;
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
// For Next.js API routes, we don't need a baseURL since they're on the same domain
// This completely avoids CORS issues
const api = axios.create({
  headers: { "Content-Type": "application/json" },
  timeout: 15000, // 15 second timeout
});

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === "ECONNABORTED") {
      console.error("Request timeout:", error.config.url);
    } else if (error.response?.status >= 500) {
      console.error("Server error:", error.response.status, error.config.url);
    } else if (!error.response) {
      console.error("Network error or no response:", error.message);
    }
    return Promise.reject(error);
  }
);

// ---------- API Functions ----------
export const getCategories = async (cacheBust = false, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const config: any = {};
      if (cacheBust) {
        config.headers = { "Cache-Control": "no-cache", Pragma: "no-cache" };
        config.params = { _: Date.now() };
      }
      const { data } = await api.get("/api/categories", config);
      return data || [];
    } catch (error) {
      console.error(
        `Error fetching categories (attempt ${i + 1}/${retries}):`,
        error
      );

      // If it's the last retry, return empty array
      if (i === retries - 1) {
        console.error("Failed to fetch categories after all retries");
        return [];
      }

      // Wait before retrying (exponential backoff)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, i) * 1000)
      );
    }
  }
  return [];
};

/** Lightweight fetch — returns only { id, name, slug } for dropdowns / filters */
export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
}

/** Size option for filter dropdown */
export interface SizeOptionFilter {
  id: string;
  name: string;
  display_order: number;
}

/** Gender option for filter dropdown */
export interface GenderOptionFilter {
  id: string;
  name: string;
  display_order: number;
}

/** Age option for filter (from DB: name for display, slug for filter) */
export interface AgeOptionFilter {
  id: string;
  name: string;
  slug: string;
  display_order: number;
}

export const getAgeOptions = async (
  retries = 3
): Promise<AgeOptionFilter[]> => {
  for (let i = 0; i < retries; i++) {
    try {
      const { data } = await api.get("/api/ages/options");
      return data || [];
    } catch (error) {
      console.error(
        `Error fetching age options (attempt ${i + 1}/${retries}):`,
        error
      );
      if (i === retries - 1) {
        console.error("Failed to fetch age options after all retries");
        return [];
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, i) * 1000)
      );
    }
  }
  return [];
};

export const getGenderOptions = async (
  retries = 3
): Promise<GenderOptionFilter[]> => {
  for (let i = 0; i < retries; i++) {
    try {
      const { data } = await api.get("/api/genders/options");
      return data || [];
    } catch (error) {
      console.error(
        `Error fetching gender options (attempt ${i + 1}/${retries}):`,
        error
      );
      if (i === retries - 1) {
        console.error("Failed to fetch gender options after all retries");
        return [];
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, i) * 1000)
      );
    }
  }
  return [];
};

export const getSizeOptions = async (
  retries = 3
): Promise<SizeOptionFilter[]> => {
  for (let i = 0; i < retries; i++) {
    try {
      const { data } = await api.get("/api/sizes/options");
      return data || [];
    } catch (error) {
      console.error(
        `Error fetching size options (attempt ${i + 1}/${retries}):`,
        error
      );
      if (i === retries - 1) {
        console.error("Failed to fetch size options after all retries");
        return [];
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, i) * 1000)
      );
    }
  }
  return [];
};

export const getCategoryOptions = async (
  retries = 3
): Promise<CategoryOption[]> => {
  for (let i = 0; i < retries; i++) {
    try {
      const { data } = await api.get("/api/categories/options");
      return data || [];
    } catch (error) {
      console.error(
        `Error fetching category options (attempt ${i + 1}/${retries}):`,
        error
      );

      if (i === retries - 1) {
        console.error(
          "Failed to fetch category options after all retries"
        );
        return [];
      }

      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, i) * 1000)
      );
    }
  }
  return [];
};

// Note: getAllProducts function removed - use getAllProductsDetailed() and transform with normalizeProduct() instead

export const getFeaturedProducts = async (
  limit = 4,
  retries = 3
): Promise<Product[]> => {
  for (let i = 0; i < retries; i++) {
    try {
      const { data } = await api.get("/api/products", {
        params: {
          limit,
          featured: true,
        },
      });
      // Return full product data
      return data?.products || [];
    } catch (error) {
      console.error(
        `Error fetching featured products (attempt ${i + 1}/${retries}):`,
        error
      );

      // If it's the last retry, return empty array
      if (i === retries - 1) {
        console.error("Failed to fetch featured products after all retries");
        return [];
      }

      // Wait before retrying (exponential backoff)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, i) * 1000)
      );
    }
  }
  return [];
};

export interface ProductsResponse {
  products: Product[];
  pagination: PaginationInfo;
}

export const getProducts = async (
  params: {
    limit?: number;
    page?: number;
    category?: string;
    sortBy?: string;
    sortOrder?: string;
    featured?: boolean;
    search?: string;
    size?: string;
    gender?: string;
    age?: string;
  } = {},
  retries = 3
): Promise<{ products: Product[]; pagination: PaginationInfo }> => {
  for (let i = 0; i < retries; i++) {
    try {
      const { data } = await api.get("/api/products", {
        params: {
          limit: params.limit || 12,
          page: params.page || 1,
          category: params.category,
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
          featured: params.featured,
          search: params.search,
          size: params.size,
          gender: params.gender,
          age: params.age,
        },
      });
      // Return full product data
      return {
        products: data?.products || [],
        pagination: data?.pagination || {
          currentPage: 1,
          totalPages: 0,
          totalItems: 0,
          itemsPerPage: 12,
          hasNextPage: false,
          hasPrevPage: false,
        },
      };
    } catch (error) {
      console.warn(
        `Error fetching products (attempt ${i + 1}/${retries}):`,
        error
      );

      // On last retry, rethrow so the caller can show the real API error (e.g. 400 body)
      if (i === retries - 1) {
        throw error;
      }

      // Wait before retrying (exponential backoff)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, i) * 1000)
      );
    }
  }
  return {
    products: [],
    pagination: {
      currentPage: 1,
      totalPages: 0,
      totalItems: 0,
      itemsPerPage: 12,
      hasNextPage: false,
      hasPrevPage: false,
    },
  };
};

export const getAllProductsDetailed = async (
  retries = 3
): Promise<Product[]> => {
  for (let i = 0; i < retries; i++) {
    try {
      const { data } = await api.get("/api/products", {
        params: {
          limit: 100, // Maximum allowed by API
        },
      });
      // Handle both old format (array) and new format (object with products array)
      if (Array.isArray(data)) {
        return data;
      } else if (data && data.products) {
        return data.products;
      }
      return [];
    } catch (error) {
      console.error(
        `Error fetching detailed products (attempt ${i + 1}/${retries}):`,
        error
      );

      // If it's the last retry, return empty array
      if (i === retries - 1) {
        console.error("Failed to fetch detailed products after all retries");
        return [];
      }

      // Wait before retrying (exponential backoff)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, i) * 1000)
      );
    }
  }
  return [];
};

export const getProductById = async (id: string): Promise<Product | null> => {
  try {
    const { data } = await api.get(`/api/products/${id}`);

    const images: string[] =
      (data.images || [])
        .map((img: any) => (typeof img === "string" ? img : img?.url || ""))
        .filter((url: string) => url && url.trim() !== "");

    const variants: ProductVariant[] = (data.variants || []).map((v: any) => ({
      slug: v.slug,
      price: v.price ?? data.price,
      stock_quantity: v.stock_quantity,
      size: v.size,
      size_slug: v.size_slug,
      color: v.color,
      color_slug: v.color_slug,
      color_hex: v.color_hex,
      display_order: v.display_order ?? 0,
    }));

    // Sizes are pre-built by the API with price and stock info
    const sizes: SizeOption[] = (data.sizes || []).map((s: any) => {
      const stockQty = s.stock_quantity;
      if (stockQty === undefined || stockQty === null) {
        console.warn(`Size "${s.name}" for product ${id} has undefined stock_quantity`);
      }
      return {
        name: s.name,
        price: s.price ?? data.price,
        stock_quantity: stockQty,
        display_order: s.display_order ?? 0,
      };
    });

    return {
      ...data,
      images,
      colors: [...new Set(variants.map((v) => v.color).filter(Boolean))],
      sizes,
      variants,
      features: (data.features || []).map((f: any) => f.feature || f),
      relatedProducts: (data.relatedProducts || []).map((p: any) => ({
        slug: p.slug,
        name: p.name,
        price: p.price,
        category: p.category,
        image: p.images?.[0] || p.image || "/placeholder.jpg",
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
  images?: string[];
}

export interface ProductUpdateRequest {
  name?: string;
  description?: string;
  price?: number;
  category?: string;
  images?: string[];
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
