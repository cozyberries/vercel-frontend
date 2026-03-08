"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getAgeOptions,
  getCategories,
  getFeaturedProducts,
  type AgeOptionFilter,
} from "@/lib/services/api";

/**
 * Custom hook for fetching age options
 * Automatically deduplicates requests and caches results
 */
export function useAgeOptions() {
  return useQuery({
    queryKey: ["ages"],
    queryFn: () => getAgeOptions(),
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours (formerly cacheTime)
  });
}

/**
 * Custom hook for fetching categories
 * Automatically deduplicates requests and caches results
 */
export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(),
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}

/**
 * Custom hook for fetching featured products
 * Automatically deduplicates requests and caches results
 * @param limit - Number of products to fetch (default: 6)
 */
export function useFeaturedProducts(limit: number = 6) {
  return useQuery({
    queryKey: ["featuredProducts", limit],
    queryFn: () => getFeaturedProducts(limit),
    staleTime: 1000 * 60 * 10, // 10 minutes (featured products change less frequently)
    gcTime: 1000 * 60 * 60, // 1 hour
  });
}
