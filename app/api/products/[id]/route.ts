import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { UpstashService } from "@/lib/upstash";
import { Product, ProductUpdate } from "@/lib/types/product";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Product ID is required" },
        { status: 400 }
      );
    }

    // Create cache key for individual product
    const cacheKey = `product:${id}`;

    // Try to get from cache first with timeout (skip if slow)
    let cachedProduct = null;
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      const cachePromise = UpstashService.getCachedProduct(id);
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Cache timeout')), 500);
      });
      cachedProduct = await Promise.race([cachePromise, timeoutPromise]) as any;
    } catch (error) {
      // Cache lookup timed out or failed, skip cache and fetch from DB
      console.warn(`Cache lookup failed or timed out for product ${id}, fetching from DB`);
    } finally {
      // Always clear the timeout to prevent memory leaks
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
    
    if (cachedProduct) {
      return NextResponse.json(cachedProduct, {
        headers: {
          "X-Cache-Status": "HIT",
          "X-Cache-Key": cacheKey,
          "X-Data-Source": "REDIS_CACHE",
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        }
      });
    }

    const supabase = await createServerSupabaseClient();
    // Optimized query: select only needed fields instead of *
    // Include product_variants with joined size and color names
    const { data, error } = await supabase
      .from("products")
      .select(
        `
        id,
        name,
        description,
        price,
        slug,
        stock_quantity,
        is_featured,
        images,
        category_id,
        created_at,
        updated_at,
        categories(name, slug),
        product_variants(id, price, stock_quantity, sku, size_id, color_id, sizes(id, name, display_order), colors(id, name, hex_code))
      `
      )
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Product not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "Failed to retrieve product" },
        { status: 500 }
      );
    }

    // Process variants into a flat structure with size/color names
    const variants = (data.product_variants || [])
      .map((v: any) => ({
        id: v.id,
        sku: v.sku,
        price: v.price ?? data.price,
        stock_quantity: Number(v.stock_quantity ?? 0),
        size: v.sizes?.name || null,
        size_id: v.size_id,
        color: v.colors?.name || null,
        color_id: v.color_id,
        display_order: v.sizes?.display_order ?? 0,
      }))
      .sort((a: any, b: any) => a.display_order - b.display_order);

    // Build deduplicated sizes list with lowest price per size
    const sizeMap = new Map<string, { name: string; price: number; stock_quantity: number; display_order: number }>();
    for (const v of variants) {
      if (!v.size) continue;
      const existing = sizeMap.get(v.size);
      if (!existing) {
        sizeMap.set(v.size, {
          name: v.size,
          price: v.price,
          stock_quantity: Number(v.stock_quantity ?? 0),
          display_order: v.display_order,
        });
      } else {
        // Sum stock across color variants of same size, keep min price
        existing.stock_quantity += Number(v.stock_quantity ?? 0);
        if (v.price < existing.price) existing.price = v.price;
      }
    }
    const sizes = Array.from(sizeMap.values()).sort(
      (a, b) => a.display_order - b.display_order
    );

    // Process product images and attach variants/sizes
    const product = {
      ...data,
      images: (data.images || []).filter((url: string) => url),
      variants,
      sizes,
      product_variants: undefined, // remove raw nested data
    };

    // Cache the product asynchronously (non-blocking) for 30 minutes
    // This improves first-time load performance by not waiting for cache write
    UpstashService.cacheProduct(id, product, 1800).catch((error) => {
      console.error(`Failed to cache product ${id}:`, error);
    });

    return NextResponse.json(product, {
      headers: {
        "X-Cache-Status": "MISS",
        "X-Cache-Key": cacheKey,
        "X-Data-Source": "SUPABASE_DATABASE",
        "X-Cache-Set": "ASYNC",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Product ID is required" },
        { status: 400 }
      );
    }

    const body: ProductUpdate = await request.json();

    // Filter out undefined values
    const updateData = Object.fromEntries(
      Object.entries(body).filter(([_, value]) => value !== undefined)
    );

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("products")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Product not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "Failed to update product" },
        { status: 500 }
      );
    }

    // Invalidate cache for this product and all product list caches
    await Promise.all([
      UpstashService.delete(`product:${id}`),
      UpstashService.deletePattern("products:*"),
    ]);

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Product ID is required" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("products")
      .delete()
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Product not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "Failed to delete product" },
        { status: 500 }
      );
    }

    // Invalidate cache for this product and all product list caches
    await Promise.all([
      UpstashService.delete(`product:${id}`),
      UpstashService.deletePattern("products:*"),
    ]);

    return NextResponse.json({ success: true, deleted: data });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
