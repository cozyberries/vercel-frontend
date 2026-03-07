import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fetchTracking } from "@/lib/utils/shipping-helpers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ waybill: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { waybill } = await params;

    if (!waybill) {
      return NextResponse.json(
        { error: "Waybill number is required" },
        { status: 400 }
      );
    }

    // Verify the waybill belongs to one of the user's orders
    const { data: order } = await supabase
      .from("orders")
      .select("id, user_id")
      .eq("delhivery_waybill", waybill)
      .single();

    if (!order || order.user_id !== user.id) {
      return NextResponse.json(
        { error: "Tracking not found" },
        { status: 404 }
      );
    }

    const tracking = await fetchTracking(waybill);

    return NextResponse.json(tracking);
  } catch (err) {
    console.error("Tracking fetch error:", err);
    return NextResponse.json(
      { error: "Unable to fetch tracking information" },
      { status: 502 }
    );
  }
}
