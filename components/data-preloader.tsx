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
  getAllProducts,
  getAllProductsDetailed,
  SimplifiedProduct,
  Product,
} from "@/lib/services/api";

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
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
}

const DataPreloaderContext = createContext<PreloadedData>({
  categories: [],
  products: [],
  detailedProducts: [],
  isLoading: true,
  error: null,
  getProductById: () => null,
  getDetailedProductById: () => null,
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
        // Load categories and products in parallel
        const [categoriesData, productsData, detailedProductsData] =
          await Promise.all([
            getCategories(),
            getAllProducts(), // Load products initially
            getAllProductsDetailed(), // Load detailed product data
          ]);

        setCategories(categoriesData);
        setProducts(productsData);
        setDetailedProducts(detailedProductsData);
        setError(null);
      } catch (err) {
        console.error("DataPreloader: Error preloading data:", err);
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
