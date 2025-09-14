"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { getCategories, getAllProducts, SimplifiedProduct } from "@/lib/services/api";

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
  isLoading: boolean;
  error: string | null;
}

const DataPreloaderContext = createContext<PreloadedData>({
  categories: [],
  products: [],
  isLoading: true,
  error: null,
});

export function DataPreloader({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<SimplifiedProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const preloadData = async () => {
      try {
        console.log("DataPreloader: Starting data preload...");
        
        // Load categories and products in parallel
        const [categoriesData, productsData] = await Promise.all([
          getCategories(),
          getAllProducts({ limit: 100 }) // Load more products initially
        ]);

        console.log("DataPreloader: Loaded", categoriesData.length, "categories and", productsData.length, "products");
        
        setCategories(categoriesData);
        setProducts(productsData);
        setError(null);
      } catch (err) {
        console.error("DataPreloader: Error preloading data:", err);
        setError(err instanceof Error ? err.message : "Failed to load data");
        // Set empty arrays as fallback
        setCategories([]);
        setProducts([]);
      } finally {
        setIsLoading(false);
      }
    };

    preloadData();
  }, []);

  return (
    <DataPreloaderContext.Provider value={{ categories, products, isLoading, error }}>
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
