import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { UpstashService, isRedisConfigured } from "@/lib/upstash";
import { Product } from "@/lib/types/product";
import { aggregateSizesFromVariants } from "@/app/api/products/route";

// TTL constants — data is static, only changes on deploy; cron refreshes daily at 2 AM IST
const TTL_REFERENCE = 86400; // 24h: categories, ages, genders, sizes
const TTL_PRODUCT   = 86400; // 24h: individual product detail pages
const TTL_LIST      = 86400; // 24h: product list pages
const TTL_RATINGS   = 86400; // 24h: ratings

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
    const sizes = aggregateSizes ? aggregateSizes(variants, fallbackPrice) : [];
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
  }
): Promise<{ key: string; count: number; totalPages: number }> {
  let query = supabase
    .from("products")
    .select(PRODUCTS_SELECT, { count: "exact" });

  if (params.featured) query = query.eq("is_featured", true);
  if (params.category !== "all") query = query.eq("category_slug", params.category);
  const sortBy = ["default", "price", "name"].includes(params.sortBy) ? params.sortBy : "default";
  const sortOrder = params.sortOrder === "asc" || params.sortOrder === "desc" ? params.sortOrder : "desc";
  if (sortBy === "price") {
    query = query.order("price", { ascending: sortOrder === "asc" });
  } else if (sortBy === "name") {
    query = query.order("name", { ascending: sortOrder === "asc" });
  } else {
    query = query.order("created_at", { ascending: false });
  }
  query = query.order("slug", { ascending: true });

  const offset = (params.page - 1) * params.limit;
  const { data, count, error } = await query.range(offset, offset + params.limit - 1);

  if (error) throw new Error(`Failed to fetch products: ${error.message}`);

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
  await UpstashService.set(key, response, TTL_LIST);
  return { key, count: products.length, totalPages };
}

async function runWarm(): Promise<{ warmed: string[]; errors: string[] }> {
  const supabase = await createServerSupabaseClient();
  const warmed: string[] = [];
  const errors: string[] = [];
  const CHUNK = 20;

  // 1. Category options
  try {
    const { data } = await supabase
      .from("categories")
      .select("slug, name")
      .eq("display", true)
      .order("name", { ascending: true });
    const options = (data || []).map((c: any) => ({ id: c.slug, name: c.name, slug: c.slug }));
    await UpstashService.set("categories:options", options, TTL_REFERENCE);
    warmed.push("categories:options");
  } catch (e: any) {
    errors.push(`category options: ${e.message}`);
  }

  // 2. Full categories (with image, for homepage)
  try {
    const { data } = await supabase
      .from("categories")
      .select("slug, name, description, image, display, created_at, updated_at")
      .eq("display", true)
      .order("name", { ascending: true });
    const processed = (data || []).map((cat: any) => ({
      ...cat,
      id: cat.slug,
      images: cat.image ? [{ url: cat.image, is_primary: true, display_order: 0 }] : [],
    }));
    await UpstashService.set("categories:list", processed, TTL_REFERENCE);
    warmed.push("categories:list");
  } catch (e: any) {
    errors.push(`full categories: ${e.message}`);
  }

  // 3. Age options (from sizes table)
  try {
    const { data } = await supabase
      .from("sizes")
      .select("slug, name, display_order")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    const ageOptions = (data || []).map((row: any) => {
      const slug = String(row.slug ?? "").toLowerCase().trim();
      return { id: slug, name: String(row.name ?? ""), slug, display_order: Number(row.display_order ?? 0) };
    });
    await UpstashService.set("ages:options", ageOptions, TTL_REFERENCE);
    warmed.push("ages:options");
  } catch (e: any) {
    errors.push(`ages:options: ${e.message}`);
  }

  // 4. Size options
  try {
    const { data } = await supabase
      .from("sizes")
      .select("slug, name, display_order")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    const sizeOptions = (data || []).flatMap((row: any) => {
      const slug = String(row.slug ?? "").toLowerCase().trim();
      if (!slug) return [];
      return [{ id: slug, slug, name: String(row.name ?? ""), display_order: Number(row.display_order ?? 0) }];
    });
    await UpstashService.set("sizes:options", sizeOptions, TTL_REFERENCE);
    warmed.push("sizes:options");
  } catch (e: any) {
    errors.push(`sizes:options: ${e.message}`);
  }

  // 5. Gender options
  try {
    const { data } = await supabase.from("genders").select("slug, name, display_order");
    const genderOrder = ["Unisex", "Girl", "Girls", "Boy", "Boys"];
    const rawOptions = (data || []).map((row: any) => ({
      id: String(row.slug),
      name: String(row.name),
      display_order: Number(row.display_order ?? 0),
    }));
    const options = [...rawOptions].sort((a, b) => {
      const i = genderOrder.findIndex((g) => g.toLowerCase() === a.name.toLowerCase());
      const j = genderOrder.findIndex((g) => g.toLowerCase() === b.name.toLowerCase());
      return (i === -1 ? 999 : i) - (j === -1 ? 999 : j);
    });
    await UpstashService.set("genders:options", options, TTL_REFERENCE);
    warmed.push("genders:options");
  } catch (e: any) {
    errors.push(`genders:options: ${e.message}`);
  }

  // 6. Ratings
  try {
    const { data: ratings } = await supabase
      .from("ratings")
      .select("*")
      .order("created_at", { ascending: false });

    await UpstashService.set("ratings:all", ratings || [], TTL_RATINGS);
    warmed.push("ratings:all");

    const byProduct = new Map<string, any[]>();
    for (const r of ratings || []) {
      if (!r.product_slug) continue;
      const arr = byProduct.get(r.product_slug) || [];
      arr.push(r);
      byProduct.set(r.product_slug, arr);
    }
    const ratingEntries = [...byProduct.entries()];
    for (let i = 0; i < ratingEntries.length; i += CHUNK) {
      const chunk = ratingEntries.slice(i, i + CHUNK);
      const keys = await Promise.all(
        chunk.map(([slug, arr]) =>
          UpstashService.set(`ratings:product:${slug}`, arr, TTL_RATINGS).then(
            () => `ratings:product:${slug}`
          )
        )
      );
      warmed.push(...keys);
    }
  } catch (e: any) {
    errors.push(`ratings: ${e.message}`);
  }

  // 7. Individual products (full detail, used by /api/products/[id])
  try {
    const { data: allProds } = await supabase
      .from("products")
      .select(PRODUCTS_SELECT)
      .order("created_at", { ascending: false });

    const productList = allProds || [];
    for (let i = 0; i < productList.length; i += CHUNK) {
      const chunk = productList.slice(i, i + CHUNK);
      const keys = await Promise.all(
        chunk.map(async (product: any) => {
          const processed = processProducts([product])[0];
          await UpstashService.cacheProduct(product.slug, processed, TTL_PRODUCT);
          return `product:${product.slug}`;
        })
      );
      warmed.push(...keys);
    }
  } catch (e: any) {
    errors.push(`individual products: ${e.message}`);
  }

  // 8. Product list pages (default sort)
  //    - All products: warm ALL pages so infinite scroll is always cached
  //    - Each category: page 1 only (less traffic)
  //    - Featured products: page 1 (home page)
  let categorySlugList: string[] = [];
  try {
    const { data: catRows } = await supabase
      .from("categories")
      .select("slug")
      .eq("display", true);
    categorySlugList = (catRows || []).map((c: any) => c.slug);
  } catch (e: any) {
    errors.push(`category slugs for product lists: ${e.message}`);
  }
  const defaultSort = { sortBy: "default", sortOrder: "desc" };

  // Warm all pages for "all products" view
  try {
    const first = await warmProductsPage(supabase, {
      limit: 12, page: 1, category: "all", featured: false, ...defaultSort,
    });
    warmed.push(first.key);
    for (let pg = 2; pg <= first.totalPages; pg++) {
      const result = await warmProductsPage(supabase, {
        limit: 12, page: pg, category: "all", featured: false, ...defaultSort,
      });
      warmed.push(result.key);
    }
  } catch (e: any) {
    errors.push(`products list (all): ${e.message}`);
  }

  // Warm page 1 for each category
  for (const category of categorySlugList) {
    try {
      const result = await warmProductsPage(supabase, {
        limit: 12, page: 1, category, featured: false, ...defaultSort,
      });
      warmed.push(result.key);
    } catch (e: any) {
      errors.push(`products list (${category}): ${e.message}`);
    }
  }

  try {
    const result = await warmProductsPage(supabase, {
      limit: 12, page: 1, category: "all", featured: true, ...defaultSort,
    });
    warmed.push(result.key);
  } catch (e: any) {
    errors.push(`featured products: ${e.message}`);
  }

  return { warmed, errors };
}

// POST — manual trigger (admin or post-deploy scripts)
export async function POST() {
  if (!isRedisConfigured()) {
    return NextResponse.json(
      { success: false, error: "Redis not configured" },
      { status: 400 }
    );
  }
  try {
    const start = Date.now();
    const { warmed, errors } = await runWarm();
    return NextResponse.json(
      {
        success: true,
        message: "Cache warming completed",
        timestamp: new Date().toISOString(),
        warmed: warmed.length,
        keysPreview: warmed.slice(0, 50),
        errors,
        durationMs: Date.now() - start,
      },
      { status: errors.length > 0 ? 207 : 200 }
    );
  } catch (error) {
    console.error("Cache warming error:", error);
    return NextResponse.json(
      { success: false, error: "Cache warming failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// GET — called by Vercel cron (daily at 2 AM UTC). Requires CRON_SECRET auth.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret === undefined) {
    // Only truly unset CRON_SECRET: fail closed in production; in dev allow for local testing.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    if (cronSecret === "") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!isRedisConfigured()) {
    return NextResponse.json(
      { success: false, error: "Redis not configured" },
      { status: 400 }
    );
  }

  try {
    const start = Date.now();
    const { warmed, errors } = await runWarm();
    return NextResponse.json(
      {
        success: true,
        message: "Cache warming completed",
        timestamp: new Date().toISOString(),
        warmed: warmed.length,
        errors,
        durationMs: Date.now() - start,
      },
      { status: errors.length > 0 ? 207 : 200 }
    );
  } catch (error) {
    console.error("Cache warming error:", error);
    return NextResponse.json(
      { success: false, error: "Cache warming failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
