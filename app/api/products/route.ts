import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { UpstashService } from "@/lib/upstash";
import { Product, ProductCreate } from "@/lib/types/product";

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
      images
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

  if (params.search) {
    query = query.or(
      `name.ilike.%${params.search}%,description.ilike.%${params.search}%`
    );
  }

  // Apply sorting
  if (params.sortBy === "price") {
    query = query.order("price", { ascending: params.sortOrder === "asc" });
  } else if (params.sortBy === "name") {
    query = query.order("name", { ascending: params.sortOrder === "asc" });
  } else {
    query = query.order("created_at", { ascending: false });
  }

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

      return {
        ...product,
        images: parsedImages.slice(0, 3),
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
    // Use descriptive key pattern for better readability
    let cacheKey;
    if (featured) {
      cacheKey = `featured:products:lt_${limit}`;
    } else if (search) {
      cacheKey = `products:search:${search}:lt_${limit}:pg_${page}`;
    } else {
      cacheKey = `products:lt_${limit}:pg_${page}:cat_${category || "all"
        }:sortb_${sortBy}:sorto_${sortOrder}`;
    }

    // Try to get from cache first with timeout (skip if slow)
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
      const headers = {
        "X-Cache-Status": isStale ? "STALE" : "HIT",
        "X-Cache-Key": cacheKey,
        "X-Data-Source": "REDIS_CACHE",
        "X-Cache-TTL": ttl.toString(),
        "X-Query-Params": JSON.stringify({
          limit,
          page,
          featured,
          category,
          search,
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
        images
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

    // Add search filtering
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Add sorting
    if (sortBy === "price") {
      query = query.order("price", { ascending: sortOrder === "asc" });
    } else if (sortBy === "name") {
      query = query.order("name", { ascending: sortOrder === "asc" });
    } else {
      // Default sorting by creation date
      query = query.order("created_at", { ascending: false });
    }

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

    // Process products images
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

      return {
        ...product,
        images: parsedImages.slice(0, 3),
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

    // Cache the results asynchronously (non-blocking) for 30 minutes
    // This improves first-time load performance by not waiting for cache write
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
        "X-Cache-Set": "ASYNC", // Indicates cache is being set asynchronously
        "X-Query-Params": JSON.stringify({
          limit,
          page,
          featured,
          category,
          search,
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

    // Invalidate product list cache when new product is created
    await UpstashService.delete("products:list:100");

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
