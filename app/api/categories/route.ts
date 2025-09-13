import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    console.log("Supabase client created successfully for categories");
    const { data, error } = await supabase
      .from("categories")
      .select(`
        *,
        categories_images(
          id,
          storage_path,
          is_primary,
          display_order,
          metadata
        )
      `)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error retrieving categories:", error);
      return NextResponse.json(
        { error: "Failed to retrieve categories" },
        { status: 500 }
      );
    }

    // Process categories to add image URLs
    const categories = (data || []).map((category: any) => {
      const images = (category.categories_images || [])
        .filter((img: any) => img.storage_path) // Filter out images with null storage_path
        .map((img: any) => ({
          id: img.id,
          storage_path: img.storage_path,
          is_primary: img.is_primary,
          display_order: img.display_order,
          metadata: img.metadata,
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
        ...category,
        images,
      };
    });

    return NextResponse.json(categories);
  } catch (error) {
    console.error("Error in GET /api/categories:", error);
    
    // Check if it's a Supabase client creation error
    if (error instanceof Error && error.message.includes('Missing Supabase environment variables')) {
      return NextResponse.json(
        { error: "Database configuration error" },
        { status: 500 }
      );
    }
    
    // Check if it's a network/connection error
    if (error instanceof Error && (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED'))) {
      return NextResponse.json(
        { error: "Database connection failed" },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
