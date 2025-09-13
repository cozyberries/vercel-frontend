import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Product } from "@/lib/types/product";

// Bestsellers API endpoint for home page

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    // Get featured products (bestsellers) with a limit
    const { data, error } = await supabase
      .from("products")
      .select(`
        *,
        categories(name),
        product_images(
          id,
          storage_path,
          is_primary,
          display_order
        )
      `)
      .eq("is_featured", true)
      .order("created_at", { ascending: false })
      .limit(8); // Limit to 8 bestsellers for home page

    if (error) {
      console.error("Error retrieving bestsellers:", error);
      return NextResponse.json(
        { error: "Failed to retrieve bestsellers" },
        { status: 500 }
      );
    }

    // Process bestsellers to add image URLs
    const bestsellers: Product[] = (data || []).map((product: any) => {
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

    return NextResponse.json(bestsellers);
  } catch (error) {
    console.error("Error in GET /api/products/bestsellers:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
