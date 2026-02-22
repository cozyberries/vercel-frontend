import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { UpstashService } from "@/lib/upstash";
import { Product } from "@/lib/types/product";
import { aggregateSizesFromVariants } from "@/app/api/products/route";

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

const PRODUCTS_SELECT = `
  slug, name, description, price, stock_quantity, is_featured, created_at, updated_at,
  category_slug, gender_slug, size_slugs, color_slugs,
  categories(name, slug),
  genders(name, slug),
  product_images(url, is_primary, display_order),
  product_variants(price, stock_quantity, size_slug, sizes(name, display_order))
`;

function processProducts(rows: any[]): Product[] {
  const aggregateSizes =
    typeof aggregateSizesFromVariants === "function" ? aggregateSizesFromVariants : null;

  return rows.map((product: any) => {
    const images = [...(product.product_images || [])]
      .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
      .map((img: any) => img.url)
      .filter(Boolean)
      .slice(0, 3);
    const variants = Array.isArray(product.product_variants) ? product.product_variants : [];
    const fallbackPrice =
      typeof product.price === "number" && !Number.isNaN(product.price) ? product.price : 0;
    const sizes =
      aggregateSizes ? aggregateSizes(variants, fallbackPrice) : [];
    return {
      ...product,
      id: product.slug,
      images,
      sizes,
      product_images: undefined,
      product_variants: undefined,
    };
  });
}

async function warmProductsPage(
  supabase: any,
  params: {
    limit: number;
    page: number;
    category: string;
    featured: boolean;
    sortBy: string;
    sortOrder: string;
  },
  ttl = 1800
): Promise<{ key: string; count: number; totalItems: number }> {
  let query = supabase
    .from("products")
    .select(PRODUCTS_SELECT, { count: "exact" });

  if (params.featured) query = query.eq("is_featured", true);
  if (params.category !== "all") query = query.eq("category_slug", params.category);

  if (params.sortBy === "price") {
    query = query.order("price", { ascending: params.sortOrder === "asc" });
  } else if (params.sortBy === "name") {
    query = query.order("name", { ascending: params.sortOrder === "asc" });
  } else {
    query = query.order("created_at", { ascending: false });
  }
  query = query.order("slug", { ascending: true });

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

  const key = productsCacheKey(params);
  await UpstashService.set(key, response, ttl);
  return { key, count: products.length, totalItems };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const warmed: string[] = [];
    const errors: string[] = [];

    // 1. Category options
    try {
      const { data: catOpts } = await supabase
        .from("categories")
        .select("slug, name")
        .eq("display", true)
        .order("name", { ascending: true });

      const options = (catOpts || []).map((c: any) => ({ id: c.slug, name: c.name, slug: c.slug }));
      await UpstashService.set("categories:options", options, 7200);
      warmed.push("categories:options");
    } catch (e: any) {
      errors.push(`category options: ${e.message}`);
    }

    // 2. Full categories (with image, for homepage)
    try {
      const { data: fullCats } = await supabase
        .from("categories")
        .select("slug, name, description, image, display, created_at, updated_at")
        .eq("display", true)
        .order("name", { ascending: true });

      const processed = (fullCats || []).map((cat: any) => ({
        ...cat,
        id: cat.slug,
        images: cat.image ? [{ url: cat.image, is_primary: true, display_order: 0 }] : [],
      }));

      await UpstashService.set("categories:list", processed, 3600);
      warmed.push("categories:list");
    } catch (e: any) {
      errors.push(`full categories: ${e.message}`);
    }

    // 3. Ratings
    const RATINGS_CONCURRENCY = 20;
    try {
      const { data: ratings } = await supabase
        .from("ratings")
        .select("*")
        .order("created_at", { ascending: false });

      await UpstashService.set("ratings:all", ratings || [], 900);
      warmed.push("ratings:all");

      const byProduct = new Map<string, any[]>();
      for (const r of ratings || []) {
        const key = r.product_slug;
        if (!key) {
          console.warn("[cache warm] Rating missing product_slug:", { id: r.id, user_id: r.user_id, created_at: r.created_at });
          continue;
        }
        const arr = byProduct.get(key) || [];
        arr.push(r);
        byProduct.set(key, arr);
      }
      const ratingEntries = [...byProduct.entries()];
      for (let i = 0; i < ratingEntries.length; i += RATINGS_CONCURRENCY) {
        const chunk = ratingEntries.slice(i, i + RATINGS_CONCURRENCY);
        const keys = await Promise.all(
          chunk.map(([slug, arr]) =>
            UpstashService.set(`ratings:product:${slug}`, arr, 900).then(
              () => `ratings:product:${slug}`
            )
          )
        );
        warmed.push(...keys);
      }
    } catch (e: any) {
      errors.push(`ratings: ${e.message}`);
    }

    // 4. Individual products
    try {
      const { data: allProds } = await supabase
        .from("products")
        .select(PRODUCTS_SELECT)
        .order("created_at", { ascending: false });

      const productList = allProds || [];
      const PRODUCTS_CONCURRENCY = RATINGS_CONCURRENCY;
      for (let i = 0; i < productList.length; i += PRODUCTS_CONCURRENCY) {
        const chunk = productList.slice(i, i + PRODUCTS_CONCURRENCY);
        const keys = await Promise.all(
          chunk.map(async (product: any) => {
            const processed = processProducts([product])[0];
            await UpstashService.cacheProduct(product.slug, processed, 1800);
            return `product:${product.slug}`;
          })
        );
        warmed.push(...keys);
      }
    } catch (e: any) {
      errors.push(`individual products: ${e.message}`);
    }

    // 5. Product list pages — common filter combinations
    const { data: catRows, error: catError } = await supabase
      .from("categories")
      .select("slug")
      .eq("display", true);

    if (catError) {
      errors.push(`categories fetch: ${catError.message}`);
    }

    const PAGE_SIZES = [4, 12];
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
              const pagesToWarm = 3;
              for (let page = 1; page <= pagesToWarm; page++) {
                const result = await warmProductsPage(supabase, {
                  limit, page, category: cat, featured: feat, sortBy, sortOrder,
                });
                warmed.push(result.key);
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
    const PREVIEW_KEYS = 50;
    return NextResponse.json(
      {
        success: true,
        message: "Cache warming completed",
        timestamp: new Date().toISOString(),
        warmed: warmed.length,
        keysPreview: warmed.slice(0, PREVIEW_KEYS),
        errors,
      },
      { status }
    );
  } catch (error) {
    console.error("Cache warming error:", error);
    return NextResponse.json(
      { success: false, error: "Cache warming failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Cache warming endpoint",
    usage: "POST to warm all caches",
  });
}
