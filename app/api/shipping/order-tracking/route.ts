import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fetchPackageTrackingByWaybill } from "@/lib/server/delhivery-package-tracking";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = await createServerSupabaseClient(cookieStore);

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

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("orderId")?.trim() ?? "";

    if (!orderId || !UUID_RE.test(orderId)) {
      return NextResponse.json(
        { error: "Invalid or missing orderId" },
        { status: 400 }
      );
    }

    const { data: row, error: orderError } = await supabase
      .from("orders")
      .select("id, user_id, tracking_number")
      .eq("id", orderId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (orderError) {
      console.error("order-tracking: orders select error", orderId, orderError.message);
      return NextResponse.json(
        { error: "Unable to load order" },
        { status: 500 }
      );
    }

    if (!row) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const waybill =
      typeof row.tracking_number === "string" ? row.tracking_number.trim() : "";

    if (!waybill) {
      return NextResponse.json(
        { error: "Tracking is not available for this order yet" },
        { status: 400 }
      );
    }

    const tracking = await fetchPackageTrackingByWaybill(waybill);

    return NextResponse.json(
      { tracking },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("order-tracking: Delhivery or internal error", message);
    return NextResponse.json(
      { error: "Unable to load tracking. Please try again later." },
      { status: 502 }
    );
  }
}
