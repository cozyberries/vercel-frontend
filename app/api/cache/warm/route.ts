import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { UpstashService } from "@/lib/upstash";
import { Product } from "@/lib/types/product";

export async function POST(request: NextRequest) {
  try {
    // Optional: Add authentication check for production
    // const authHeader = request.headers.get("authorization");
    // if (authHeader !== `Bearer ${process.env.CACHE_WARM_SECRET}`) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // }

    const { searchParams } = new URL(request.url);
    const warmFeatured = searchParams.get("featured") !== "false"; // Default to true
    const warmProducts = searchParams.get("products") !== "false"; // Default to true
    const warmCategories = searchParams.get("categories") !== "false"; // Default to true

    const supabase = await createServerSupabaseClient();
    const results = {
      featured: null as any,
      products: null as any,
      categories: null as any,
      errors: [] as string[],
    };

    // Warm featured products cache
    if (warmFeatured) {
      try {
        const featuredQuery = supabase.from("products").select(
          `
            *,
            categories(name, slug),
            product_images(
              id,
              storage_path,
              is_primary,
              display_order
            )
          `,
          { count: "exact" }
        ).eq("is_featured", true);

        const { data: featuredData, error: featuredError } = await featuredQuery;

        if (featuredError) {
          results.errors.push(`Featured products error: ${featuredError.message}`);
        } else {
          // Process featured products
          const featuredProducts: Product[] = (featuredData || []).map((product: any) => {
            const images = (product.product_images || [])
              .filter((img: any) => img.storage_path)
              .map((img: any) => ({
                id: img.id,
                storage_path: img.storage_path,
                is_primary: img.is_primary,
                display_order: img.display_order,
                url: `/${img.storage_path}`,
              }))
              .sort((a: any, b: any) => {
                if (a.display_order !== b.display_order) {
                  return (a.display_order || 0) - (b.display_order || 0);
                }
                return b.is_primary ? 1 : -1;
              });

            return {
              ...product,
              images,
            };
          });

          const featuredResponse = {
            products: featuredProducts,
            pagination: {
              currentPage: 1,
              totalPages: 1,
              totalItems: featuredProducts.length,
              itemsPerPage: featuredProducts.length,
              hasNextPage: false,
              hasPrevPage: false,
            },
          };

          // Cache featured products with the same key format as the main API
          const featuredCacheKey = "featured:products:lt_100";
          await UpstashService.set(featuredCacheKey, featuredResponse, 1800);
          results.featured = {
            cacheKey: featuredCacheKey,
            count: featuredProducts.length,
          };
        }
      } catch (error) {
        results.errors.push(`Featured products cache warming failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Warm main products cache (first page)
    if (warmProducts) {
      try {
        const productsQuery = supabase.from("products").select(
          `
            *,
            categories(name, slug),
            product_images(
              id,
              storage_path,
              is_primary,
              display_order
            )
          `,
          { count: "exact" }
        ).order("created_at", { ascending: false }).range(0, 11); // First 12 products

        const { data: productsData, error: productsError, count } = await productsQuery;

        if (productsError) {
          results.errors.push(`Products error: ${productsError.message}`);
        } else {
          // Process products
          const products: Product[] = (productsData || []).map((product: any) => {
            const images = (product.product_images || [])
              .filter((img: any) => img.storage_path)
              .map((img: any) => ({
                id: img.id,
                storage_path: img.storage_path,
                is_primary: img.is_primary,
                display_order: img.display_order,
                url: `/${img.storage_path}`,
              }))
              .sort((a: any, b: any) => {
                if (a.display_order !== b.display_order) {
                  return (a.display_order || 0) - (b.display_order || 0);
                }
                return b.is_primary ? 1 : -1;
              });

            return {
              ...product,
              images,
            };
          });

          const totalItems = count || 0;
          const totalPages = Math.ceil(totalItems / 12);

          const productsResponse = {
            products,
            pagination: {
              currentPage: 1,
              totalPages,
              totalItems,
              itemsPerPage: 12,
              hasNextPage: 1 < totalPages,
              hasPrevPage: false,
            },
          };

          // Cache first page of products with default sorting
          const productsCacheKey = "products:lt_12:pg_1:cat_all:sortb_default:sorto_desc";
          await UpstashService.set(productsCacheKey, productsResponse, 1800);
          results.products = {
            cacheKey: productsCacheKey,
            count: products.length,
            totalItems,
          };
        }
      } catch (error) {
        results.errors.push(`Products cache warming failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Warm categories cache
    if (warmCategories) {
      try {
        const { data: categoriesData, error: categoriesError } = await supabase
          .from("categories")
          .select("*")
          .order("name");

        if (categoriesError) {
          results.errors.push(`Categories error: ${categoriesError.message}`);
        } else {
          // Cache categories
          await UpstashService.set("categories:all", categoriesData || [], 3600); // Cache for 1 hour
          results.categories = {
            cacheKey: "categories:all",
            count: categoriesData?.length || 0,
          };
        }
      } catch (error) {
        results.errors.push(`Categories cache warming failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const status = results.errors.length > 0 ? 207 : 200; // Multi-status if there are errors
    
    return NextResponse.json({
      success: true,
      message: "Cache warming completed",
      timestamp: new Date().toISOString(),
      results,
    }, { status });

  } catch (error) {
    console.error("Cache warming error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Cache warming failed",
        details: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// GET endpoint for health check / manual triggering
export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: "Cache warming endpoint is ready",
    usage: "POST to this endpoint to warm caches",
    parameters: {
      featured: "true/false - warm featured products cache (default: true)",
      products: "true/false - warm main products cache (default: true)", 
      categories: "true/false - warm categories cache (default: true)",
    },
    example: "/api/cache/warm?featured=true&products=true&categories=true",
  });
}
