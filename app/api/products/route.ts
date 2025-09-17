import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { UpstashService } from "@/lib/upstash";
import { Product, ProductCreate } from "@/lib/types/product";

export async function GET(request: NextRequest) {
  try {

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "100");
    const featured = searchParams.get("featured") === "true";

    // Validate limit parameter
    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: "Limit must be between 1 and 100" },
        { status: 400 }
      );
    }

    // Create cache key based on limit and featured filter
    const cacheKey = `products:list:${limit}${featured ? ':featured' : ''}`;
    
    // Try to get from cache first
    const cachedProducts = await UpstashService.get(cacheKey);
    if (cachedProducts) {
      return NextResponse.json(cachedProducts, {
        headers: {
          'X-Cache-Status': 'HIT',
          'X-Cache-Key': cacheKey,
          'X-Data-Source': 'REDIS_CACHE'
        }
      });
    }

    const supabase = await createServerSupabaseClient();

    // Build query to get products with category name join and product images
    let query = supabase
      .from("products")
      .select(
        `
        *,
        categories(name),
        product_images(
          id,
          storage_path,
          is_primary,
          display_order
        )
      `,
        { count: "exact" }
      );

    // Add featured filter if requested
    if (featured) {
      query = query.eq("is_featured", true);
    }

    const { data, error, count } = await query.limit(limit);

    if (error) {
      return NextResponse.json(
        { error: "Failed to retrieve products", details: error.message },
        { status: 500 }
      );
    }

    // Process products to add image URLs
    const products: Product[] = (data || []).map((product: any) => {
      const images = (product.product_images || [])
        .filter((img: any) => img.storage_path) // Filter out images with null storage_path
        .map((img: any) => ({
          id: img.id,
          storage_path: img.storage_path,
          is_primary: img.is_primary,
          display_order: img.display_order,
          url: `/${img.storage_path}`, // Dynamic path from database (Next.js serves from /public at root)
        }))
        .sort((a: any, b: any) => {
          // Sort by display_order, then by is_primary
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


    // Cache the results for 30 minutes
    const cacheResult = await UpstashService.set(cacheKey, products, 1800);

    return NextResponse.json(products, {
      headers: {
        'X-Cache-Status': 'MISS',
        'X-Cache-Key': cacheKey,
        'X-Data-Source': 'SUPABASE_DATABASE',
        'X-Cache-Set': cacheResult ? 'SUCCESS' : 'FAILED'
      }
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
    await UpstashService.delete('products:list:100');

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
