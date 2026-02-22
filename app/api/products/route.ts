import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { UpstashService } from "@/lib/upstash";
import { Product, ProductCreate } from "@/lib/types/product";

type AggregatedSize = {
  name: string;
  price: number;
  stock_quantity: number;
  display_order: number;
};

/**
 * Aggregate sizes from product variants, deduplicating by size name.
 * Sums stock across same-size variants and keeps the lowest price.
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

/**
 * Pure function — no DB call needed.
 * Boy/Boys → ['boy', 'unisex'], Girl/Girls → ['girl', 'unisex'], anything else → [slug].
 */
function resolveGenderSlugsForFilter(gender: string): string[] {
  const normalized = gender.trim().toLowerCase();
  if (/^boy(s)?$/.test(normalized)) return ["boy", "unisex"];
  if (/^girl(s)?$/.test(normalized)) return ["girl", "unisex"];
  if (normalized === "unisex") return ["unisex"];
  return [normalized];
}

/** Extract ordered image URLs from the product_images join result. */
function extractImages(productImages: any[], limit?: number): string[] {
  const sorted = [...(productImages || [])].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
  );
  const urls = sorted.map((img) => img.url).filter(Boolean);
  return limit ? urls.slice(0, limit) : urls;
}

// ─── In-memory LRU cache ────────────────────────────────────────────────────

type MemoryCacheEntry = { data: any; timestamp: number };
const inMemoryProductsCache = new Map<string, MemoryCacheEntry>();
const PRODUCTS_MEMORY_TTL = 30_000;
const MAX_MEMORY_ENTRIES = 50;

function touchCacheKey(key: string): void {
  const entry = inMemoryProductsCache.get(key);
  if (entry === undefined) return;
  inMemoryProductsCache.delete(key);
  inMemoryProductsCache.set(key, entry);
}

function getMemoryCache(key: string): MemoryCacheEntry | undefined {
  const entry = inMemoryProductsCache.get(key);
  if (entry === undefined) return undefined;
  touchCacheKey(key);
  return entry;
}

function setMemoryCache(key: string, entry: MemoryCacheEntry): void {
  inMemoryProductsCache.delete(key);
  inMemoryProductsCache.set(key, entry);
  while (inMemoryProductsCache.size > MAX_MEMORY_ENTRIES) {
    const firstKey = inMemoryProductsCache.keys().next().value;
    if (firstKey) inMemoryProductsCache.delete(firstKey);
    else break;
  }
}

// ─── Shared select string ───────────────────────────────────────────────────

const PRODUCTS_LIST_SELECT = `
  slug,
  name,
  description,
  price,
  stock_quantity,
  is_featured,
  created_at,
  updated_at,
  category_slug,
  gender_slug,
  size_slugs,
  color_slugs,
  categories(name, slug),
  genders(name, slug),
  product_images(url, is_primary, display_order),
  product_variants(price, stock_quantity, size_slug, sizes(name, display_order))
`;

// ─── Background cache refresh ────────────────────────────────────────────────

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

  let query = supabase
    .from("products")
    .select(PRODUCTS_LIST_SELECT, { count: "exact" });

  if (params.featured) query = query.eq("is_featured", true);

  if (params.category && params.category !== "all") {
    query = query.eq("category_slug", params.category.trim().toLowerCase());
  }

  if (params.gender && params.gender !== "all") {
    const slugs = resolveGenderSlugsForFilter(params.gender);
    if (slugs.length > 0) query = query.in("gender_slug", slugs);
  }

  if (params.age) {
    query = query.contains("size_slugs", [params.age.trim().toLowerCase()]);
  }

  if (params.size) {
    query = query.contains("size_slugs", [params.size.trim().toLowerCase()]);
  }

  if (params.search) {
    query = query.or(
      `name.ilike.%${params.search}%,description.ilike.%${params.search}%`
    );
  }

  if (params.sortBy === "price") {
    query = query.order("price", { ascending: params.sortOrder === "asc" });
  } else if (params.sortBy === "name") {
    query = query.order("name", { ascending: params.sortOrder === "asc" });
  } else {
    query = query.order("created_at", { ascending: false });
  }
  query = query.order("slug", { ascending: true });

  const offset = (params.page - 1) * params.limit;
  const { data, count } = await query.range(offset, offset + params.limit - 1);

  if (!data) return;

  const products: Product[] = data.map((product: any) => {
    const images = extractImages(product.product_images, 3);
    const sizes = aggregateSizesFromVariants(
      product.product_variants || [],
      product.price
    );
    return {
      ...product,
      id: product.slug,
      images,
      sizes,
      product_images: undefined,
      product_variants: undefined,
    };
  });

  const totalItems = count || 0;
  const totalPages = Math.ceil(totalItems / params.limit);

  const response = {
    products,
    pagination: {
      currentPage: params.page,
      totalPages,
      totalItems,
      itemsPerPage: params.limit,
      hasNextPage: params.page < totalPages,
      hasPrevPage: params.page > 1,
    },
  };

  UpstashService.set(cacheKey, response, 1800).catch((error) => {
    console.error(`Failed to refresh cache for key ${cacheKey}:`, error);
  });
  console.log(`Cache refresh initiated for key: ${cacheKey}`);
}

// ─── GET /api/products ───────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const featured = searchParams.get("featured") === "true";
    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const size = searchParams.get("size");
    const gender = searchParams.get("gender");
    const age = searchParams.get("age");
    const sortBy = searchParams.get("sortBy") || "default";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: "Limit must be between 1 and 100" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(page) || page < 1) {
      return NextResponse.json(
        { error: "Page must be greater than 0" },
        { status: 400 }
      );
    }

    const cacheKey = `products:lt_${limit}:pg_${page}:cat_${category || "all"}:feat_${featured}:sortb_${sortBy}:sorto_${sortOrder}${search ? `:q_${encodeURIComponent(search)}` : ""}${size ? `:size_${encodeURIComponent(size)}` : ""}${gender ? `:gender_${encodeURIComponent(gender)}` : ""}${age ? `:age_${encodeURIComponent(age)}` : ""}`;

    // 1. In-memory cache (instant)
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

    // 2. Redis cache
    let cachedResponse = null;
    let ttl = -1;
    let isStale = false;
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      const cachePromise = UpstashService.getWithTTL(cacheKey);
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Cache timeout")), 500);
      });
      const result = (await Promise.race([cachePromise, timeoutPromise])) as {
        data: any;
        ttl: number;
        isStale: boolean;
      };
      cachedResponse = result.data;
      ttl = result.ttl;
      isStale = result.isStale;
    } catch {
      console.warn("Cache lookup failed or timed out for products, fetching from DB");
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (cachedResponse) {
      setMemoryCache(cacheKey, { data: cachedResponse, timestamp: Date.now() });
      if (isStale) {
        (async () => {
          try {
            await refreshCacheInBackground(cacheKey, {
              limit, page, featured, category, search, size, gender, age, sortBy, sortOrder,
            });
          } catch (error) {
            console.error(`Background revalidation failed for ${cacheKey}:`, error);
          }
        })();
      }
      return NextResponse.json(cachedResponse, {
        headers: {
          "X-Cache-Status": isStale ? "STALE" : "HIT",
          "X-Cache-Key": cacheKey,
          "X-Data-Source": "REDIS_CACHE",
          "X-Cache-TTL": ttl.toString(),
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      });
    }

    // 3. Single DB query — all filters applied inline, no pre-query lookups
    const supabase = await createServerSupabaseClient();
    let query = supabase
      .from("products")
      .select(PRODUCTS_LIST_SELECT, { count: "exact" });

    if (featured) query = query.eq("is_featured", true);

    // Category: direct slug match — no extra lookup needed
    if (category && category !== "all") {
      query = query.eq("category_slug", category.trim().toLowerCase());
    }

    // Gender: pure function, no DB round-trip
    if (gender && gender !== "all") {
      const genderSlugs = resolveGenderSlugsForFilter(gender);
      if (genderSlugs.length > 0) query = query.in("gender_slug", genderSlugs);
    }

    // Age: age slug IS the size slug — direct array contains
    if (age) {
      query = query.contains("size_slugs", [age.trim().toLowerCase()]);
    }

    // Size: slug IS the identifier — direct array contains, no lookup
    if (size) {
      query = query.contains("size_slugs", [size.trim().toLowerCase()]);
    }

    if (search) {
      const escapedSearch = search
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_");
      query = query.or(
        `name.ilike.%${escapedSearch}%,description.ilike.%${escapedSearch}%`
      );
    }

    if (sortBy === "price") {
      query = query.order("price", { ascending: sortOrder === "asc" });
    } else if (sortBy === "name") {
      query = query.order("name", { ascending: sortOrder === "asc" });
    } else {
      query = query.order("created_at", { ascending: false });
    }
    query = query.order("slug", { ascending: true });

    const offset = (page - 1) * limit;
    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json(
        { error: "Failed to retrieve products", details: error.message },
        { status: 500 }
      );
    }

    const products: Product[] = (data || []).map((product: any) => {
      const images = extractImages(product.product_images, 3);
      const sizes = aggregateSizesFromVariants(
        product.product_variants || [],
        product.price
      );
      return {
        ...product,
        id: product.slug,
        images,
        sizes,
        product_images: undefined,
        product_variants: undefined,
      };
    });

    const totalItems = count || 0;
    const totalPages = Math.ceil(totalItems / limit);

    const response = {
      products,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };

    setMemoryCache(cacheKey, { data: response, timestamp: Date.now() });
    UpstashService.set(cacheKey, response, 1800).catch((error) => {
      console.error(`Failed to cache products data for key: ${cacheKey}`, error);
    });

    return NextResponse.json(response, {
      headers: {
        "X-Cache-Status": "MISS",
        "X-Cache-Key": cacheKey,
        "X-Data-Source": "SUPABASE_DATABASE",
        "X-Cache-Set": "ASYNC",
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Missing Supabase environment variables")
    ) {
      return NextResponse.json(
        { error: "Database configuration error" },
        { status: 500 }
      );
    }
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

// ─── POST /api/products ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body: ProductCreate = await request.json();

    if (!body.name || typeof body.price !== "number") {
      return NextResponse.json(
        { error: "Name and price are required fields" },
        { status: 400 }
      );
    }

    const slug = body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const supabase = await createServerSupabaseClient();

    const { data: existingSlugs } = await supabase
      .from("products")
      .select("slug")
      .or(`slug.eq.${slug},slug.like.${slug}-%`);

    let uniqueSlug = slug;
    if (existingSlugs && existingSlugs.length > 0) {
      const slugSet = new Set(existingSlugs.map((p: { slug: string }) => p.slug));
      if (slugSet.has(slug)) {
        let counter = 1;
        while (slugSet.has(`${slug}-${counter}`)) {
          counter++;
        }
        uniqueSlug = `${slug}-${counter}`;
      }
    }

    const productData = {
      name: body.name,
      description: body.description || null,
      price: body.price,
      slug: uniqueSlug,
      stock_quantity: 0,
      is_featured: false,
    };

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

    await UpstashService.deletePattern("products:*");
    inMemoryProductsCache.clear();

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
