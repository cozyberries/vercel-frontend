import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { UpstashService } from "@/lib/upstash";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query || query.length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    // Normalise to lowercase for cache-key consistency
    const normalised = query.trim().toLowerCase();
    const cacheKey = `search:suggestions:${normalised}`;

    // 1. Try Redis cache (short TTL — search results change with product updates)
    const cached = await UpstashService.get(cacheKey).catch(() => null);
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          "X-Cache-Status": "HIT",
          "X-Data-Source": "REDIS_CACHE",
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      });
    }

    // 2. Fetch from DB
    const supabase = await createServerSupabaseClient();

    // Search products
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select(`
        id,
        name,
        slug,
        categories(name, slug),
        product_images(storage_path, is_primary)
      `)
      .ilike("name", `%${normalised}%`)
      .limit(5);

    if (productsError) {
      console.error("Error fetching products:", productsError);
    }

    // Search categories
    const { data: categories, error: categoriesError } = await supabase
      .from("categories")
      .select("id, name, slug")
      .ilike("name", `%${normalised}%`)
      .limit(3);

    if (categoriesError) {
      console.error("Error fetching categories:", categoriesError);
    }

    // Process suggestions
    const suggestions = [];

    // Add product suggestions
    if (products) {
      for (const product of products) {
        const primaryImage = product.product_images?.find((img: any) => img.is_primary);
        suggestions.push({
          id: product.id,
          name: product.name,
          type: "product",
          slug: product.slug,
          image: primaryImage ? `/${primaryImage.storage_path}` : undefined,
          categoryName: Array.isArray(product.categories) ? product.categories[0]?.name : (product.categories as any)?.name,
        });
      }
    }

    // Add category suggestions
    if (categories) {
      for (const category of categories) {
        suggestions.push({
          id: category.id,
          name: category.name,
          type: "category",
          slug: category.slug,
        });
      }
    }

    // Sort suggestions by relevance (products first, then categories)
    suggestions.sort((a, b) => {
      if (a.type === "product" && b.type === "category") return -1;
      if (a.type === "category" && b.type === "product") return 1;
      return 0;
    });

    const response = { suggestions };

    // 3. Cache in Redis for 5 minutes
    UpstashService.set(cacheKey, response, 300).catch(() => {});

    return NextResponse.json(response, {
      headers: {
        "X-Cache-Status": "MISS",
        "X-Data-Source": "SUPABASE_DATABASE",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    console.error("Error in search suggestions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
