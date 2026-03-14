"use client";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
} from "react";
import {
  getAllProductsDetailed,
  Product,
} from "@/lib/services/api";
import { useCategories } from "@/hooks/useApiQueries";

/** Full category shape from /api/categories (needed for grid display + images). */
interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  display?: boolean;
  image?: string;
  images?: { url?: string }[];
  is_primary?: boolean;
}

interface PreloadedData {
  categories: Category[];
  products: Product[];
  detailedProducts: Product[];
  isLoading: boolean;
  error: string | null;
  getProductById: (id: string) => Product | null;
  getDetailedProductById: (id: string) => Product | null;
  loadProducts: () => Promise<void>;
}

const DataPreloaderContext = createContext<PreloadedData>({
  categories: [],
  products: [],
  detailedProducts: [],
  isLoading: true,
  error: null,
  getProductById: () => null,
  getDetailedProductById: () => null,
  loadProducts: async () => {},
});

export function DataPreloader({ children }: { children: ReactNode }) {
  // Full categories (with display, image) for homepage grid; shared cache with other consumers.
  const {
    data: categories = [] as Category[],
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useCategories();

  const [products, setProducts] = useState<Product[]>([]);
  const [detailedProducts, setDetailedProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);

  const isLoading = categoriesLoading || productsLoading;
  const error = productsError || (categoriesError instanceof Error ? categoriesError.message : categoriesError ? String(categoriesError) : null);

  const getProductById = (id: string): Product | null => {
    return products.find((product) => product.id === id) || null;
  };

  const getDetailedProductById = (id: string): Product | null => {
    return detailedProducts.find((product) => product.id === id) || null;
  };

  const loadProducts = async () => {
    if (products.length > 0) return; // Already loaded

    try {
      setProductsLoading(true);
      const rawProductsData = await getAllProductsDetailed();

      setProducts(rawProductsData);
      setDetailedProducts(rawProductsData);
      setProductsError(null);
    } catch (err) {
      console.error("Error loading products:", err);
      setProductsError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setProductsLoading(false);
    }
  };

  return (
    <DataPreloaderContext.Provider
      value={{
        categories,
        products,
        detailedProducts,
        isLoading,
        error,
        getProductById,
        getDetailedProductById,
        loadProducts,
      }}
    >
      {children}
    </DataPreloaderContext.Provider>
  );
}

export function usePreloadedData() {
  const context = useContext(DataPreloaderContext);
  if (!context) {
    throw new Error("usePreloadedData must be used within a DataPreloader");
  }
  return context;
}
