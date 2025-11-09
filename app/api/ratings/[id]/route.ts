import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest, { params }: { params: { productId: string } }) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("ratings")
      .select("*")
      .eq("product_id", params.productId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching product ratings:", error);
    return NextResponse.json({ error: "Failed to fetch ratings" }, { status: 500 });
  }
}
