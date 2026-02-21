import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { UpstashService } from "@/lib/upstash";
import { Product, ProductCreate } from "@/lib/types/product";

// Type for aggregated size information
type AggregatedSize = {
  name: string;
  price: number;
  stock_quantity: number;
  display_order: number;
};

/**
 * Helper function to aggregate sizes from product variants
 * Handles nullable stock_quantity and deduplicates sizes
 */
export function aggregateSizesFromVariants(
  variants: any[],
  fallbackPrice: number
): AggregatedSize[] {
  const sizeMap = new Map<string, AggregatedSize>();
  
  for (const v of variants) {
    const sizeName = v.sizes?.name;
    if (!sizeName) continue;
    
    const existing = sizeMap.get(sizeName);
    const variantPrice = v.price ?? fallbackPrice;
    const variantStock = Number(v.stock_quantity ?? 0);
    
    if (!existing) {
      sizeMap.set(sizeName, {
        name: sizeName,
        price: variantPrice,
        stock_quantity: variantStock,
        display_order: v.sizes?.display_order ?? 0,
      });
    } else {
      existing.stock_quantity += variantStock;
      if (variantPrice < existing.price) existing.price = variantPrice;
    }
  }
  
  return Array.from(sizeMap.values()).sort(
    (a, b) => a.display_order - b.display_order
  );
}

// In-memory cache for products API (avoids Redis round-trip for repeated requests)
type MemoryCacheEntry = { data: any; timestamp: number };
const inMemoryProductsCache = new Map<string, MemoryCacheEntry>();
const PRODUCTS_MEMORY_TTL = 30_000; // 30 seconds in-memory TTL
const MAX_MEMORY_ENTRIES = 50; // Max entries in memory cache

/** Moves key to the "most-recent" end of the Map for LRU. Call on every read and before write. */
function touchCacheKey(key: string): void {
  const entry = inMemoryProductsCache.get(key);
  if (entry === undefined) return;
  inMemoryProductsCache.delete(key);
  inMemoryProductsCache.set(key, entry);
}

/** LRU get: returns entry and moves key to most-recently-used. */
function getMemoryCache(key: string): MemoryCacheEntry | undefined {
  const entry = inMemoryProductsCache.get(key);
  if (entry === undefined) return undefined;
  touchCacheKey(key);
  return entry;
}

/** LRU set: (re)sets entry at most-recent end and evicts oldest if over capacity. */
function setMemoryCache(key: string, entry: MemoryCacheEntry): void {
  inMemoryProductsCache.delete(key);
  inMemoryProductsCache.set(key, entry);
  while (inMemoryProductsCache.size > MAX_MEMORY_ENTRIES) {
    const firstKey = inMemoryProductsCache.keys().next().value;
    if (firstKey) inMemoryProductsCache.delete(firstKey);
    else break;
  }
}

// Resolve size param to size_id (accepts size name or UUID)
async function resolveSizeId(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  size: string
): Promise<string | null> {
  const isUUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(size);
  if (isUUID) {
    return size;
  }
  const { data, error } = await supabase
    .from("sizes")
    .select("id")
    .ilike("name", size)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("Failed to resolve size in products route:", error.message);
    return null;
  }
  return data?.id ?? null;
}

// Homepage "Shop by Age" slugs → DB size names (products are filtered by variant sizes).
const AGE_SLUG_TO_SIZE_NAMES: Record<string, string[]> = {
  "0-3-months": ["0-3M"],
  "3-6-months": ["3-6M"],
  "6-12-months": ["6-12M"],
  "1-2-years": ["1-2Y"],
  "2-3-years": ["2-3Y"],
  "3-6-years": ["3-4Y", "4-5Y", "5-6Y"],
};

// Resolve age slug to size_ids for filtering (products that have at least one variant in any of these sizes).
async function resolveAgeToSizeIds(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  ageSlug: string
): Promise<string[]> {
  const sizeNames = AGE_SLUG_TO_SIZE_NAMES[ageSlug];
  if (!sizeNames?.length) return [];
  const ids: string[] = [];
  for (const name of sizeNames) {
    const id = await resolveSizeId(supabase, name);
    if (id) ids.push(id);
  }
  return ids;
}

// Resolve gender param to one or more gender_ids for filtering.
// Boy → Boy + Unisex, Girl → Girl + Unisex, Unisex → Unisex only.
async function resolveGenderIdsForFilter(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  gender: string
): Promise<string[]> {
  const isUUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gender);
  if (isUUID) {
    return [gender];
  }

  const { data: genders, error } = await supabase
    .from("genders")
    .select("id, name");
  if (error) {
    console.error("Failed to fetch genders in products route:", error.message);
    return [];
  }
  if (!genders?.length) return [];

  const unisex = genders.find((g) => /unisex/i.test(g.name));
  const selected = genders.find(
    (g) => g.name.toLowerCase() === gender.toLowerCase()
  );

  if (!selected) return [];

  const selectedId = selected.id;
  const unisexId = unisex?.id;

  // Boy/Boys: show Boy + Unisex
  if (/^boy(s)?$/i.test(gender)) {
    return unisexId && unisexId !== selectedId
      ? [selectedId, unisexId]
      : [selectedId];
  }
  // Girl/Girls: show Girl + Unisex
  if (/^girl(s)?$/i.test(gender)) {
    return unisexId && unisexId !== selectedId
      ? [selectedId, unisexId]
      : [selectedId];
  }
  // Unisex or other: single id
  return [selectedId];
}

// Background cache refresh function
async function refreshCacheInBackground(
  cacheKey: string,
  params: {
    limit: number;
    page: number;
    featured: boolean;
    category: string | null;
    search: string | null;
    sortBy: string;
    sortOrder: string;
    size: string | null;
    gender: string | null;
    age: string | null;
  }
) {
  const supabase = await createServerSupabaseClient();

  // Build the same optimized query
  let query = supabase.from("products").select(
    `
      id,
      name,
      description,
      price,
      slug,
      stock_quantity,
      is_featured,
      created_at,
      updated_at,
      category_id,
      categories(name, slug),
      images,
      product_variants(id, price, stock_quantity, sizes(name, display_order))
    `,
    { count: "exact" }
  );

  // Apply the same filters
  if (params.featured) {
    query = query.eq("is_featured", true);
  }

  if (params.category && params.category !== "all") {
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        params.category
      );

    if (isUUID) {
      query = query.eq("category_id", params.category);
    } else {
      const { data: categoryData } = await supabase
        .from("categories")
        .select("id")
        .eq("slug", params.category)
        .single();

      if (categoryData) {
        query = query.eq("category_id", categoryData.id);
      }
    }
  }

  if (params.gender && params.gender !== "all") {
    const genderIds = await resolveGenderIdsForFilter(supabase, params.gender);
    if (genderIds.length > 0) {
      query = query.in("gender_id", genderIds);
    }
  }

  // Age filter (from "Shop by Age"): products that have at least one variant in any of the age's sizes
  if (params.age) {
    const ageSizeIds = await resolveAgeToSizeIds(supabase, params.age);
    if (ageSizeIds.length > 0) {
      const { data: variantRows, error: variantError } = await supabase
        .from("product_variants")
        .select("product_id")
        .in("size_id", ageSizeIds);
      if (!variantError) {
        const productIds = [...new Set((variantRows || []).map((r) => r.product_id))];
        if (productIds.length > 0) {
          query = query.in("id", productIds);
        } else {
          query = query.eq("id", "00000000-0000-0000-0000-000000000000"); // no match
        }
      }
    } else {
      query = query.eq("id", "00000000-0000-0000-0000-000000000000"); // unknown age slug
    }
  }

  if (params.size) {
    const sizeId = await resolveSizeId(supabase, params.size);
    if (sizeId) {
      const { data: variantRows, error: variantError } = await supabase
        .from("product_variants")
        .select("product_id")
        .eq("size_id", sizeId);
      if (variantError) {
        console.error("Failed to fetch product_variants by size:", variantError.message);
        return;
      }
      const productIds = [...new Set((variantRows || []).map((r) => r.product_id))];
      if (productIds.length === 0) {
        // No products have this size; return empty without hitting products table
        const emptyResponse = {
          products: [],
          pagination: {
            currentPage: params.page,
            totalPages: 0,
            totalItems: 0,
            itemsPerPage: params.limit,
            hasNextPage: false,
            hasPrevPage: false,
          },
        };
        UpstashService.set(cacheKey, emptyResponse, 1800).catch(() => {});
        return;
      }
      query = query.in("id", productIds);
    }
  }

  if (params.search) {
    query = query.or(
      `name.ilike.%${params.search}%,description.ilike.%${params.search}%`
    );
  }

  // Apply sorting (always add secondary sort by id for stable pagination)
  if (params.sortBy === "price") {
    query = query.order("price", { ascending: params.sortOrder === "asc" });
  } else if (params.sortBy === "name") {
    query = query.order("name", { ascending: params.sortOrder === "asc" });
  } else {
    query = query.order("created_at", { ascending: false });
  }
  query = query.order("id", { ascending: true });

  // Apply pagination
  const offset = (params.page - 1) * params.limit;
  const { data, count } = await query.range(offset, offset + params.limit - 1);

  if (data) {
    // Process the data the same way
    const products: Product[] = (data || []).map((product: any) => {
      let parsedImages: string[] = [];

      try {
        if (product.images) {
          if (typeof product.images === "string") {
            if (product.images.trim().startsWith("[") || product.images.trim().startsWith("{")) {
              parsedImages = JSON.parse(product.images);
            } else {
              parsedImages = [product.images];
            }
          } else if (Array.isArray(product.images)) {
            parsedImages = product.images;
          }
        }
      } catch (err) {
        console.warn(`Invalid image data for product ${product.id}:`, product.images);
      }

      // Build deduplicated sizes list from variants
      const sizes = aggregateSizesFromVariants(
        product.product_variants || [],
        product.price
      );

      return {
        ...product,
        images: parsedImages.slice(0, 3),
        sizes,
        product_variants: undefined,
      };
    });


    const totalItems = count || 0;
    const totalPages = Math.ceil(totalItems / params.limit);
    const hasNextPage = params.page < totalPages;
    const hasPrevPage = params.page > 1;

    const response = {
      products,
      pagination: {
        currentPage: params.page,
        totalPages,
        totalItems,
        itemsPerPage: params.limit,
        hasNextPage,
        hasPrevPage,
      },
    };

    // Update cache with fresh data (non-blocking in background)
    UpstashService.set(cacheKey, response, 1800).catch((error) => {
      console.error(`Failed to refresh cache for key ${cacheKey}:`, error);
    });
    console.log(`Cache refresh initiated for key: ${cacheKey}`);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "100");
    const page = parseInt(searchParams.get("page") || "1");
    const featured = searchParams.get("featured") === "true";
    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const size = searchParams.get("size");
    const gender = searchParams.get("gender");
    const age = searchParams.get("age");
    const sortBy = searchParams.get("sortBy") || "default";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Validate limit parameter
    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: "Limit must be between 1 and 100" },
        { status: 400 }
      );
    }

    // Validate page parameter
    if (page < 1) {
      return NextResponse.json(
        { error: "Page must be greater than 0" },
        { status: 400 }
      );
    }

    // Create cache key based on all parameters
    // Every unique filter combination gets its own Redis entry
    const cacheKey = `products:lt_${limit}:pg_${page}:cat_${category || "all"}:feat_${featured}:sortb_${sortBy}:sorto_${sortOrder}${search ? `:q_${encodeURIComponent(search)}` : ""}${size ? `:size_${encodeURIComponent(size)}` : ""}${gender ? `:gender_${encodeURIComponent(gender)}` : ""}${age ? `:age_${encodeURIComponent(age)}` : ""}`;

    // 1. Check in-memory cache first (instant); LRU get touches the key
    const memEntry = getMemoryCache(cacheKey);
    if (memEntry && Date.now() - memEntry.timestamp < PRODUCTS_MEMORY_TTL) {
      return NextResponse.json(memEntry.data, {
        headers: {
          "X-Cache-Status": "HIT",
          "X-Cache-Key": cacheKey,
          "X-Data-Source": "MEMORY_CACHE",
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      });
    }

    // Try to get from Redis cache first with timeout (skip if slow)
    let cachedResponse = null;
    let ttl = -1;
    let isStale = false;
    
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      const cachePromise = UpstashService.getWithTTL(cacheKey);
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Cache timeout')), 500);
      });
      const result = await Promise.race([cachePromise, timeoutPromise]) as { data: any; ttl: number; isStale: boolean };
      cachedResponse = result.data;
      ttl = result.ttl;
      isStale = result.isStale;
    } catch (error) {
      // Cache lookup timed out or failed, skip cache and fetch from DB
      console.warn(`Cache lookup failed or timed out for products, fetching from DB`);
    } finally {
      // Clear the timeout to prevent memory leaks if cache promise resolved first
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }

    // If we have cached data, return it immediately
    if (cachedResponse) {
      setMemoryCache(cacheKey, { data: cachedResponse, timestamp: Date.now() });

      const headers = {
        "X-Cache-Status": isStale ? "STALE" : "HIT",
        "X-Cache-Key": cacheKey,
        "X-Data-Source": "REDIS_CACHE",
        "X-Cache-TTL": ttl.toString(),
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        "X-Query-Params": JSON.stringify({
          limit,
          page,
          featured,
          category,
          search,
          size,
          gender,
          age,
          sortBy,
          sortOrder,
        }),
      };

      // If data is stale, trigger background revalidation
      if (isStale) {
        // Background revalidation - don't await this
        (async () => {
          try {
            console.log(`Background revalidation for cache key: ${cacheKey}`);
            // Re-run the same query logic to refresh cache
            await refreshCacheInBackground(cacheKey, {
              limit,
              page,
              featured,
              category,
              search,
              size,
              gender,
              age,
              sortBy,
              sortOrder,
            });
          } catch (error) {
            console.error(
              `Background revalidation failed for ${cacheKey}:`,
              error
            );
          }
        })();
      }

      return NextResponse.json(cachedResponse, { headers });
    }

    const supabase = await createServerSupabaseClient();

    // Build optimized query - limit image data for better performance
    // Only fetch essential fields and limit images to primary + first few
    let query = supabase.from("products").select(
      `
        id,
        name,
        description,
        price,
        slug,
        stock_quantity,
        is_featured,
        created_at,
        updated_at,
        category_id,
        categories(name, slug),
        images,
        product_variants(id, price, stock_quantity, sizes(name, display_order))
      `,
      { count: "exact" }
    );

    // Add filters
    if (featured) {
      query = query.eq("is_featured", true);
    }

    if (category && category !== "all") {
      // Check if category is already an ID (UUID format) or a slug
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          category
        );

      if (isUUID) {
        // Category is already an ID, use it directly
        query = query.eq("category_id", category);
      } else {
        // Category is a slug, look up the ID
        const { data: categoryData, error: categoryError } = await supabase
          .from("categories")
          .select("id")
          .eq("slug", category)
          .single();

        if (categoryError) {
          return NextResponse.json(
            { error: "Invalid category", details: categoryError.message },
            { status: 400 }
          );
        }

        if (categoryData) {
          query = query.eq("category_id", categoryData.id);
        } else {
          return NextResponse.json(
            { error: "Category not found" },
            { status: 404 }
          );
        }
      }
    }

    // Gender filter: Boy → Boy + Unisex, Girl → Girl + Unisex, Unisex → Unisex only
    if (gender && gender !== "all") {
      const genderIds = await resolveGenderIdsForFilter(supabase, gender);
      if (genderIds.length > 0) {
        query = query.in("gender_id", genderIds);
      }
    }

    // Age filter (from "Shop by Age"): products that have at least one variant in any of the age's sizes
    if (age) {
      const ageSizeIds = await resolveAgeToSizeIds(supabase, age);
      if (ageSizeIds.length === 0) {
        const response = {
          products: [],
          pagination: {
            currentPage: page,
            totalPages: 0,
            totalItems: 0,
            itemsPerPage: limit,
            hasNextPage: false,
            hasPrevPage: false,
          },
        };
        setMemoryCache(cacheKey, { data: response, timestamp: Date.now() });
        UpstashService.set(cacheKey, response, 1800).catch(() => {});
        return NextResponse.json(response, {
          headers: {
            "X-Cache-Status": "MISS",
            "X-Cache-Key": cacheKey,
            "X-Data-Source": "SUPABASE_DATABASE",
            "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
          },
        });
      }
      const { data: variantRows, error: variantError } = await supabase
        .from("product_variants")
        .select("product_id")
        .in("size_id", ageSizeIds);
      if (variantError) {
        return NextResponse.json(
          { error: "Failed to filter by age", details: variantError.message },
          { status: 500 }
        );
      }
      const productIds = [...new Set((variantRows || []).map((r) => r.product_id))];
      if (productIds.length === 0) {
        const response = {
          products: [],
          pagination: {
            currentPage: page,
            totalPages: 0,
            totalItems: 0,
            itemsPerPage: limit,
            hasNextPage: false,
            hasPrevPage: false,
          },
        };
        setMemoryCache(cacheKey, { data: response, timestamp: Date.now() });
        UpstashService.set(cacheKey, response, 1800).catch(() => {});
        return NextResponse.json(response, {
          headers: {
            "X-Cache-Status": "MISS",
            "X-Cache-Key": cacheKey,
            "X-Data-Source": "SUPABASE_DATABASE",
            "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
          },
        });
      }
      query = query.in("id", productIds);
    }

    // Size filter: only products that have at least one variant in this size
    if (size) {
      const sizeId = await resolveSizeId(supabase, size);
      if (!sizeId) {
        // Unknown size: return empty result (do not silently return all products)
        const response = {
          products: [],
          pagination: {
            currentPage: page,
            totalPages: 0,
            totalItems: 0,
            itemsPerPage: limit,
            hasNextPage: false,
            hasPrevPage: false,
          },
        };
        setMemoryCache(cacheKey, { data: response, timestamp: Date.now() });
        UpstashService.set(cacheKey, response, 1800).catch(() => {});
        return NextResponse.json(response, {
          headers: {
            "X-Cache-Status": "MISS",
            "X-Cache-Key": cacheKey,
            "X-Data-Source": "SUPABASE_DATABASE",
            "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
          },
        });
      }
      const { data: variantRows, error: variantError } = await supabase
        .from("product_variants")
        .select("product_id")
        .eq("size_id", sizeId);
      if (variantError) {
        return NextResponse.json(
          { error: "Failed to filter by size", details: variantError.message },
          { status: 500 }
        );
      }
      const productIds = [...new Set((variantRows || []).map((r) => r.product_id))];
      if (productIds.length === 0) {
        const response = {
          products: [],
          pagination: {
            currentPage: page,
            totalPages: 0,
            totalItems: 0,
            itemsPerPage: limit,
            hasNextPage: false,
            hasPrevPage: false,
          },
        };
        setMemoryCache(cacheKey, { data: response, timestamp: Date.now() });
        UpstashService.set(cacheKey, response, 1800).catch(() => {});
        return NextResponse.json(response, {
          headers: {
            "X-Cache-Status": "MISS",
            "X-Cache-Key": cacheKey,
            "X-Data-Source": "SUPABASE_DATABASE",
            "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
          },
        });
      }
      query = query.in("id", productIds);
    }

    // Add search filtering
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Add sorting (always add secondary sort by id for stable pagination)
    if (sortBy === "price") {
      query = query.order("price", { ascending: sortOrder === "asc" });
    } else if (sortBy === "name") {
      query = query.order("name", { ascending: sortOrder === "asc" });
    } else {
      // Default sorting by creation date
      query = query.order("created_at", { ascending: false });
    }
    query = query.order("id", { ascending: true });

    // Add pagination
    const offset = (page - 1) * limit;
    const { data, error, count } = await query.range(
      offset,
      offset + limit - 1
    );

    if (error) {
      return NextResponse.json(
        { error: "Failed to retrieve products", details: error.message },
        { status: 500 }
      );
    }

    // Process products images and variants
    const products: Product[] = (data || []).map((product: any) => {
      let parsedImages: string[] = [];

      try {
        if (product.images) {
          if (typeof product.images === "string") {
            if (product.images.trim().startsWith("[") || product.images.trim().startsWith("{")) {
              parsedImages = JSON.parse(product.images);
            } else {
              parsedImages = [product.images];
            }
          } else if (Array.isArray(product.images)) {
            parsedImages = product.images;
          }
        }
      } catch (err) {
        console.warn(`Invalid image data for product ${product.id}:`, product.images);
      }

      // Build deduplicated sizes list from variants
      const sizes = aggregateSizesFromVariants(
        product.product_variants || [],
        product.price
      );

      return {
        ...product,
        images: parsedImages.slice(0, 3),
        sizes,
        product_variants: undefined,
      };
    });


    // Calculate pagination info
    const totalItems = count || 0;
    const totalPages = Math.ceil(totalItems / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    const response = {
      products,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
        hasNextPage,
        hasPrevPage,
      },
    };

    setMemoryCache(cacheKey, { data: response, timestamp: Date.now() });

    // Cache the results asynchronously (non-blocking) for 30 minutes
    UpstashService.set(cacheKey, response, 1800).catch((error) => {
      console.error(
        `Failed to cache products data for key: ${cacheKey}`,
        error
      );
    });

    return NextResponse.json(response, {
      headers: {
        "X-Cache-Status": "MISS",
        "X-Cache-Key": cacheKey,
        "X-Data-Source": "SUPABASE_DATABASE",
        "X-Cache-Set": "ASYNC",
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        "X-Query-Params": JSON.stringify({
          limit,
          page,
          featured,
          category,
          search,
          size,
          gender,
          age,
          sortBy,
          sortOrder,
        }),
      },
    });
  } catch (error) {
    // Check if it's a Supabase client creation error
    if (
      error instanceof Error &&
      error.message.includes("Missing Supabase environment variables")
    ) {
      return NextResponse.json(
        { error: "Database configuration error" },
        { status: 500 }
      );
    }

    // Check if it's a network/connection error
    if (
      error instanceof Error &&
      (error.message.includes("fetch failed") ||
        error.message.includes("ECONNREFUSED"))
    ) {
      return NextResponse.json(
        { error: "Database connection failed" },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: ProductCreate = await request.json();

    // Validate required fields
    if (!body.name || typeof body.price !== "number") {
      return NextResponse.json(
        { error: "Name and price are required fields" },
        { status: 400 }
      );
    }

    // Create slug from name if not provided
    const slug = body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Prepare data for insertion
    const productData = {
      name: body.name,
      description: body.description || null,
      price: body.price,
      slug: slug,
      stock_quantity: 0, // Default stock quantity
      is_featured: false, // Default to not featured
      images: body.images || [],
    };

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("products")
      .insert([productData])
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Failed to create product: ${error.message}` },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "No data returned from database" },
        { status: 500 }
      );
    }

    // Invalidate all product list caches when a new product is created
    await UpstashService.deletePattern("products:*");
    // Also clear in-memory cache to avoid serving stale data
    inMemoryProductsCache.clear();

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
