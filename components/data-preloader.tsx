"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  getCategories,
  getAllProductsDetailed,
  SimplifiedProduct,
  Product,
} from "@/lib/services/api";
import { normalizeProduct } from "@/lib/utils/product";

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  display?: boolean;
  images?: Array<{
    id: string;
    storage_path: string;
    is_primary?: boolean;
    display_order?: number;
    metadata?: any;
    url?: string;
  }>;
}

interface PreloadedData {
  categories: Category[];
  products: SimplifiedProduct[];
  detailedProducts: Product[];
  isLoading: boolean;
  error: string | null;
  getProductById: (id: string) => SimplifiedProduct | null;
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<SimplifiedProduct[]>([]);
  const [detailedProducts, setDetailedProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const preloadData = async () => {
      try {
        // Only load categories initially - products will be loaded on-demand
        const categoriesData = await getCategories();

        setCategories(categoriesData);
        setProducts([]); // Products will be loaded when needed
        setDetailedProducts([]); // Detailed products will be loaded when needed
        setError(null);
      } catch (err) {
        console.error("Error preloading data:", err);
        setError(err instanceof Error ? err.message : "Failed to load data");
        // Set empty arrays as fallback
        setCategories([]);
        setProducts([]);
        setDetailedProducts([]);
      } finally {
        setIsLoading(false);
      }
    };

    preloadData();
  }, []);

  const getProductById = (id: string): SimplifiedProduct | null => {
    return products.find((product) => product.id === id) || null;
  };

  const getDetailedProductById = (id: string): Product | null => {
    return detailedProducts.find((product) => product.id === id) || null;
  };

  const loadProducts = async () => {
    if (products.length > 0) return; // Already loaded
    
    try {
      setIsLoading(true);
      const rawProductsData = await getAllProductsDetailed();
      const simplifiedProducts = rawProductsData.map(normalizeProduct);
      
      setProducts(simplifiedProducts);
      setDetailedProducts(rawProductsData);
      setError(null);
    } catch (err) {
      console.error("Error loading products:", err);
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setIsLoading(false);
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
