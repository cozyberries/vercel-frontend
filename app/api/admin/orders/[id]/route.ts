import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { authenticateRequest } from "@/lib/jwt-auth";
import CacheService from "@/lib/services/cache";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate the request using JWT
    const auth = await authenticateRequest(request);

    if (!auth.isAuthenticated || !auth.isAdmin) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const supabase = createAdminSupabaseClient();

    const body = await request.json();
    const resolvedParams = await params;
    const orderId = resolvedParams.id;

    // Update order status
    const { data, error } = await supabase
      .from("orders")
      .update({
        status: body.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Failed to update order: ${error.message}` },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    // Clear orders cache for the user to ensure fresh data
    try {
      await CacheService.clearAllOrders(data.user_id);
      await CacheService.clearOrderDetails(data.user_id, orderId);
      console.log(`Orders cache cleared for user: ${data.user_id} after admin update`);
    } catch (cacheError) {
      console.error("Error clearing orders cache after admin update:", cacheError);
      // Don't fail the update if cache clearing fails
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
