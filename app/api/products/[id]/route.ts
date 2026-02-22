import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { UpstashService } from "@/lib/upstash";
import { Product, ProductUpdate } from "@/lib/types/product";
import { aggregateSizesFromVariants } from "../route";

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

    const cacheKey = `product:${id}`;

    let cachedProduct = null;
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      const cachePromise = UpstashService.getCachedProduct(id);
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Cache timeout")), 500);
      });
      cachedProduct = (await Promise.race([cachePromise, timeoutPromise])) as any;
    } catch {
      console.warn(`Cache lookup timed out for product ${id}, fetching from DB`);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (cachedProduct) {
      return NextResponse.json(cachedProduct, {
        headers: {
          "X-Cache-Status": "HIT",
          "X-Cache-Key": cacheKey,
          "X-Data-Source": "REDIS_CACHE",
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      });
    }

    const supabase = await createServerSupabaseClient();

    // Single query — slug is the PK; images, features, variants all joined
    const { data, error } = await supabase
      .from("products")
      .select(
        `
        slug,
        name,
        description,
        price,
        care_instructions,
        stock_quantity,
        is_featured,
        created_at,
        updated_at,
        category_slug,
        gender_slug,
        size_slugs,
        color_slugs,
        categories(name, slug),
        genders(name, slug),
        product_images(url, is_primary, display_order),
        product_features(feature, display_order),
        product_variants(
          slug,
          price,
          stock_quantity,
          size_slug,
          color_slug,
          sizes(slug, name, display_order),
          colors(slug, name, hex_code, base_color)
        )
        `
      )
      .eq("slug", id)
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

    const images = [...(data.product_images || [])]
      .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
      .map((img: any) => img.url)
      .filter(Boolean);

    const features = [...(data.product_features || [])]
      .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
      .map((f: any) => f.feature);

    const variants = [...(data.product_variants || [])]
      .map((v: any) => ({
        slug: v.slug,
        price: v.price ?? data.price,
        stock_quantity: Number(v.stock_quantity ?? 0),
        size: v.sizes?.name ?? null,
        size_slug: v.size_slug ?? v.sizes?.slug ?? null,
        color: v.colors?.name ?? null,
        color_slug: v.color_slug,
        color_hex: v.colors?.hex_code ?? null,
        display_order: v.sizes?.display_order ?? 0,
      }))
      .sort((a: any, b: any) => a.display_order - b.display_order);

    const sizes = aggregateSizesFromVariants(
      data.product_variants || [],
      data.price ?? 0
    );

    const product = {
      ...data,
      id: data.slug,
      images,
      features,
      variants,
      sizes,
      product_images: undefined,
      product_features: undefined,
      product_variants: undefined,
    };

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
      .eq("slug", id)
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
      .eq("slug", id)
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
