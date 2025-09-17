import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { UpstashService } from "@/lib/upstash";
import { Product, ProductCreate } from "@/lib/types/product";

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
      cacheKey = `products:lt_${limit}:pg_${page}:cat_${category || 'all'}:sortb_${sortBy}:sorto_${sortOrder}`;
    }
    
    // Try to get from cache first
    const cachedResponse = await UpstashService.get(cacheKey);
    if (cachedResponse) {
      return NextResponse.json(cachedResponse, {
        headers: {
          'X-Cache-Status': 'HIT',
          'X-Cache-Key': cacheKey,
          'X-Data-Source': 'REDIS_CACHE',
          'X-Query-Params': JSON.stringify({ limit, page, featured, category, search, sortBy, sortOrder })
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
        categories(name, slug),
        product_images(
          id,
          storage_path,
          is_primary,
          display_order
        )
      `,
        { count: "exact" }
      );

    // Add filters
    if (featured) {
      query = query.eq("is_featured", true);
    }

    if (category && category !== "all") {
      query = query.eq("categories.slug", category);
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
    const { data, error, count } = await query.range(offset, offset + limit - 1);

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
      }
    };

    // Cache the results for 30 minutes
    const cacheResult = await UpstashService.set(cacheKey, response, 1800);

    return NextResponse.json(response, {
      headers: {
        'X-Cache-Status': 'MISS',
        'X-Cache-Key': cacheKey,
        'X-Data-Source': 'SUPABASE_DATABASE',
        'X-Cache-Set': cacheResult ? 'SUCCESS' : 'FAILED',
        'X-Query-Params': JSON.stringify({ limit, page, featured, category, search, sortBy, sortOrder })
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
