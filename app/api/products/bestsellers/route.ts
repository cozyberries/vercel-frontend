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
      .select("*")
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

    const bestsellers: Product[] = data || [];

    return NextResponse.json(bestsellers);
  } catch (error) {
    console.error("Error in GET /api/products/bestsellers:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
