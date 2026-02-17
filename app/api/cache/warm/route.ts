import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { UpstashService } from "@/lib/upstash";
import { Product } from "@/lib/types/product";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the same cache key the products list API uses */
function productsCacheKey(params: {
  limit: number;
  page: number;
  category: string;
  featured: boolean;
  sortBy: string;
  sortOrder: string;
}) {
  return `products:lt_${params.limit}:pg_${params.page}:cat_${params.category}:feat_${params.featured}:sortb_${params.sortBy}:sorto_${params.sortOrder}`;
}

/** Parse product images from various formats to a normalized array */
function parseProductImages(images: any): string[] {
  try {
    if (!images) {
      return [];
    }

    let parsedImages: any = images;

    // Handle string inputs (could be JSON or a single URL)
    if (typeof images === "string") {
      const trimmed = images.trim();
      if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        parsedImages = JSON.parse(trimmed);
      } else {
        // Plain string URL
        return trimmed ? [trimmed] : [];
      }
    }

    // Handle array results
    if (Array.isArray(parsedImages)) {
      return parsedImages.filter((url: any) => typeof url === "string" && url);
    }

    // Handle object results from JSON.parse (e.g., {"url": "..."})
    if (typeof parsedImages === "object" && parsedImages !== null) {
      // Try to extract URL-like values from the object
      const values = Object.values(parsedImages);
      const urls = values.filter((val: any) => typeof val === "string" && val);
      return urls as string[];
    }

    // Fallback for any other type
    return [];
  } catch {
    // Return empty array on any parsing error
    return [];
  }
}

/** Process raw product rows into the shape the frontend expects */
function processProducts(rows: any[]): Product[] {
  return rows.map((product: any) => {
    const parsedImages = parseProductImages(product.images);
    return { ...product, images: parsedImages.slice(0, 3) };
  });
}

/** Fetch & cache a single "products page" from DB */
async function warmProductsPage(
  supabase: any,
  params: {
    limit: number;
    page: number;
    category: string;
    categoryId?: string;
    featured: boolean;
    sortBy: string;
    sortOrder: string;
  },
  ttl = 1800
): Promise<{ key: string; count: number; totalItems: number }> {
  let query = supabase
    .from("products")
    .select(
      `id, name, description, price, slug, stock_quantity, is_featured, created_at, updated_at, category_id, categories(name, slug), images`,
      { count: "exact" }
    );

  if (params.featured) query = query.eq("is_featured", true);
  if (params.categoryId) query = query.eq("category_id", params.categoryId);

  // Sorting
  if (params.sortBy === "price") {
    query = query.order("price", { ascending: params.sortOrder === "asc" });
  } else if (params.sortBy === "name") {
    query = query.order("name", { ascending: params.sortOrder === "asc" });
  } else {
    query = query.order("created_at", { ascending: false });
  }
  query = query.order("id", { ascending: true });

  const offset = (params.page - 1) * params.limit;
  const { data, count, error } = await query.range(offset, offset + params.limit - 1);

  if (error) {
    console.error("Cache warm: failed to fetch products page:", error.message);
    throw new Error(`Failed to fetch products: ${error.message}`);
  }

  const products = processProducts(data || []);
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

  const key = productsCacheKey({
    limit: params.limit,
    page: params.page,
    category: params.category,
    featured: params.featured,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  });

  await UpstashService.set(key, response, ttl);

  return { key, count: products.length, totalItems };
}

// ---------------------------------------------------------------------------
// POST  — full cache warm
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const warmed: string[] = [];
    const errors: string[] = [];

    // ── 1. Category options (lightweight) ────────────────────────────
    try {
      const { data: catOpts } = await supabase
        .from("categories")
        .select("id, name, slug")
        .eq("display", true)
        .order("name", { ascending: true });

      await UpstashService.set("categories:options", catOpts || [], 7200);
      warmed.push("categories:options");
    } catch (e: any) {
      errors.push(`category options: ${e.message}`);
    }

    // ── 2. Full categories (with images, for homepage) ───────────────
    try {
      const { data: fullCats } = await supabase
        .from("categories")
        .select(`*, categories_images(id, storage_path, url, is_primary, display_order, metadata)`)
        .eq("display", true)
        .order("name", { ascending: true });

      const resolveImageUrl = (img: any) => {
        if (img.url && typeof img.url === "string" && img.url.startsWith("http")) return img.url;
        const path = img.storage_path;
        if (!path) return undefined;
        return path.startsWith("http") ? path : `/${path}`;
      };
      const processed = (fullCats || []).map((cat: any) => {
        const images = (cat.categories_images || [])
          .filter((img: any) => img.url || img.storage_path)
          .map((img: any) => ({
            id: img.id,
            storage_path: img.storage_path,
            is_primary: img.is_primary,
            display_order: img.display_order,
            metadata: img.metadata,
            url: resolveImageUrl(img),
          }))
          .sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0));
        return { ...cat, images };
      });

      await UpstashService.set("categories:list", processed, 3600);
      warmed.push("categories:list");
    } catch (e: any) {
      errors.push(`full categories: ${e.message}`);
    }

    // ── 3. Ratings (all) ─────────────────────────────────────────────
    const RATINGS_CONCURRENCY = 20;
    try {
      const { data: ratings } = await supabase
        .from("ratings")
        .select("*")
        .order("created_at", { ascending: false });

      await UpstashService.set("ratings:all", ratings || [], 900);
      warmed.push("ratings:all");

      // Per-product ratings (parallel with bounded concurrency)
      const byProduct = new Map<string, any[]>();
      for (const r of ratings || []) {
        const arr = byProduct.get(r.product_id) || [];
        arr.push(r);
        byProduct.set(r.product_id, arr);
      }
      const ratingEntries = [...byProduct.entries()];
      for (let i = 0; i < ratingEntries.length; i += RATINGS_CONCURRENCY) {
        const chunk = ratingEntries.slice(i, i + RATINGS_CONCURRENCY);
        const keys = await Promise.all(
          chunk.map(([pid, arr]) =>
            UpstashService.set(`ratings:product:${pid}`, arr, 900).then(
              () => `ratings:product:${pid}`
            )
          )
        );
        warmed.push(...keys);
      }
    } catch (e: any) {
      errors.push(`ratings: ${e.message}`);
    }

    // ── 4. Individual products ───────────────────────────────────────
    try {
      const { data: allProds } = await supabase
        .from("products")
        .select(`id, name, description, price, slug, stock_quantity, is_featured, images, category_id, created_at, updated_at, categories(name, slug)`)
        .order("created_at", { ascending: false });

      const productList = allProds || [];
      const PRODUCTS_CONCURRENCY = RATINGS_CONCURRENCY;
      for (let i = 0; i < productList.length; i += PRODUCTS_CONCURRENCY) {
        const chunk = productList.slice(i, i + PRODUCTS_CONCURRENCY);
        const keys = await Promise.all(
          chunk.map(async (product) => {
            const processed = {
              ...product,
              images: parseProductImages(product.images),
            };
            await UpstashService.cacheProduct(product.id, processed, 1800);
            return `product:${product.id}`;
          })
        );
        warmed.push(...keys);
      }
    } catch (e: any) {
      errors.push(`individual products: ${e.message}`);
    }

    // ── 5. Product list pages — all common filter combinations ───────
    // Fetch category slugs + IDs for per-category warming
    const { data: catRows, error: catError } = await supabase
      .from("categories")
      .select("id, slug")
      .eq("display", true);

    if (catError) {
      console.error("Cache warm: failed to fetch categories:", catError.message);
      errors.push(`categories fetch: ${catError.message}`);
    }
    const categoryMap = new Map((catRows || []).map((c: any) => [c.slug, c.id]));

    const PAGE_SIZES = [4, 12]; // mobile / desktop
    const SORT_COMBOS = [
      { sortBy: "default", sortOrder: "desc" },
      { sortBy: "price", sortOrder: "asc" },
      { sortBy: "price", sortOrder: "desc" },
    ];
    const CATEGORIES = ["all", ...(catRows || []).map((c: any) => c.slug)];
    const FEATURED_FLAGS = [false, true];

    for (const limit of PAGE_SIZES) {
      for (const { sortBy, sortOrder } of SORT_COMBOS) {
        for (const cat of CATEGORIES) {
          for (const feat of FEATURED_FLAGS) {
            try {
              // Warm first 3 pages for each combination
              const pagesToWarm = 3;
              for (let page = 1; page <= pagesToWarm; page++) {
                const result = await warmProductsPage(supabase, {
                  limit,
                  page,
                  category: cat,
                  categoryId: cat !== "all" ? categoryMap.get(cat) : undefined,
                  featured: feat,
                  sortBy,
                  sortOrder,
                });
                warmed.push(result.key);

                // Stop paging if no more data
                if (result.count === 0 || result.count < limit) break;
              }
            } catch (e: any) {
              errors.push(`products combo: ${e.message}`);
            }
          }
        }
      }
    }

    const status = errors.length > 0 ? 207 : 200;
    return NextResponse.json(
      {
        success: true,
        message: "Cache warming completed",
        timestamp: new Date().toISOString(),
        warmed: warmed.length,
        keys: warmed,
        errors,
      },
      { status }
    );
  } catch (error) {
    console.error("Cache warming error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Cache warming failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// GET   — health check
// ---------------------------------------------------------------------------

export async function GET() {
  return NextResponse.json({
    message: "Cache warming endpoint",
    usage: "POST to warm all caches",
    warmsKeys: [
      "categories:options (id/name/slug for filters)",
      "categories:list (full with images for homepage)",
      "ratings:all + ratings:product:{id}",
      "product:{id} (each individual product)",
      "products:lt_{4|12}:pg_{1-3}:cat_{all|slug}:feat_{true|false}:sortb_{default|price}:sorto_{asc|desc}",
    ],
  });
}
