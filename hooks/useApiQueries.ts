"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getAgeOptions,
  getCategories,
  getFeaturedProducts,
  getCategoryOptions,
  getSizeOptions,
  getGenderOptions,
  getProducts,
  getProductById,
  getActiveOfferFromApi,
  getProfileCombined,
  type AgeOptionFilter,
  type CategoryOption,
  type SizeOptionFilter,
  type GenderOptionFilter,
} from "@/lib/services/api";
import type { ActiveOfferResponse } from "@/lib/types/order";
import type { ProfileCombinedResponse } from "@/lib/services/api";

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

/**
 * Custom hook for fetching lightweight category options (id, name, slug)
 * Used in product filters — cached for 1 hour
 */
export function useCategoryOptions() {
  return useQuery<CategoryOption[]>({
    queryKey: ["categoryOptions"],
    queryFn: () => getCategoryOptions(),
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
  });
}

/**
 * Custom hook for fetching size filter options
 * Cached for 1 hour since sizes rarely change
 */
export function useSizeOptions() {
  return useQuery<SizeOptionFilter[]>({
    queryKey: ["sizeOptions"],
    queryFn: () => getSizeOptions(),
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
  });
}

/**
 * Custom hook for fetching gender filter options
 * Cached for 1 hour since genders rarely change
 */
export function useGenderOptions() {
  return useQuery<GenderOptionFilter[]>({
    queryKey: ["genderOptions"],
    queryFn: () => getGenderOptions(),
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
  });
}

/**
 * Custom hook for fetching a single product by slug
 * Caches for 5 minutes — product data rarely changes
 */
export function useProductById(slug: string | null | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["product", slug],
    queryFn: () => getProductById(slug!),
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
    enabled: (options?.enabled ?? true) && !!slug,
  });
}

/**
 * Custom hook for fetching paginated products with filters
 * Caches each unique filter combination for 30 seconds
 */
export function useProducts(params: {
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
  enabled?: boolean;
}) {
  const { enabled = true, ...queryParams } = params;
  return useQuery({
    queryKey: ["products", queryParams],
    queryFn: () => getProducts(queryParams),
    staleTime: 1000 * 30, // 30 seconds  
    gcTime: 1000 * 60 * 5, // 5 minutes
    enabled,
  });
}

/**
 * Fetches the current active offer from /api/offers/active.
 * Cached for 10 minutes — offer config rarely changes mid-session.
 * Returns null when no offer is active.
 */
export function useActiveOffer() {
  return useQuery<ActiveOfferResponse | null>({
    queryKey: ["activeOffer"],
    queryFn: () => getActiveOfferFromApi(),
    staleTime: 1000 * 60 * 10,  // 10 minutes
    gcTime: 1000 * 60 * 60,     // 1 hour
  });
}

/** Query key prefix for profile+addresses combined; append userId for invalidation. */
export const PROFILE_COMBINED_QUERY_KEY = ["profile", "combined"] as const;

/**
 * Fetches profile and addresses in one request. Cached per user for 1 min, gc 10 min.
 * Enable only when userId is present (authenticated). Used by useProfile.
 */
export function useProfileCombined(userId: string | undefined) {
  return useQuery<ProfileCombinedResponse>({
    queryKey: [...PROFILE_COMBINED_QUERY_KEY, userId],
    queryFn: () => getProfileCombined(),
    staleTime: 1000 * 60,       // 1 minute
    gcTime: 1000 * 60 * 10,    // 10 minutes
    enabled: !!userId,
  });
}

