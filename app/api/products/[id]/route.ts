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

    // Try to get from cache first
    const cachedProduct = await UpstashService.getCachedProduct(id);
    if (cachedProduct) {
      return NextResponse.json(cachedProduct);
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("products")
      .select(
        `
        *,
        categories(name)
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

    // Process product images
    const product = {
      ...data,
      images: (data.images || []).filter((url: string) => url),
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
        "X-Cache-Set": "ASYNC", // Indicates cache is being set asynchronously
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

    // Invalidate cache for this product and product list
    await Promise.all([
      UpstashService.delete(`product:${id}`),
      UpstashService.delete("products:list:100"), // Invalidate main product list cache
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

    // Invalidate cache for this product and product list
    await Promise.all([
      UpstashService.delete(`product:${id}`),
      UpstashService.delete("products:list:100"), // Invalidate main product list cache
    ]);

    return NextResponse.json({ success: true, deleted: data });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
