import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // Extract query param from the URL
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("product_id");

    let query = supabase.from("ratings").select("*").order("created_at", { ascending: false });
    if (productId) {
      query = query.eq("product_id", productId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("Error fetching ratings:", error);
    return NextResponse.json(
      { error: "Failed to fetch ratings" },
      { status: 500 }
    );
  }
}
