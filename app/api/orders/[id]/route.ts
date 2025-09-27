import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import CacheService from "@/lib/services/cache";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Get the current user from Supabase session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const { id } = resolvedParams;

    if (!id) {
      return NextResponse.json(
        { error: "Order ID is required" },
        { status: 400 }
      );
    }

    // Try to get from cache first
    const { data: cachedOrderDetails, ttl, isStale } = await CacheService.getOrderDetails(user.id, id);
    
    if (cachedOrderDetails) {
      const headers = {
        "X-Cache-Status": isStale ? "STALE" : "HIT",
        "X-Cache-Key": CacheService.getCacheKey("ORDER_DETAILS", user.id, id),
        "X-Data-Source": "REDIS_CACHE",
        "X-Cache-TTL": ttl.toString(),
      };

      // If data is stale, trigger background revalidation
      if (isStale) {
        (async () => {
          try {
            console.log(`Background revalidation for order details: ${user.id}/${id}`);
            await refreshOrderDetailsInBackground(user.id, id, supabase);
          } catch (error) {
            console.error(`Background order details refresh failed for user ${user.id}, order ${id}:`, error);
          }
        })();
      }

      return NextResponse.json(cachedOrderDetails, { headers });
    }

    // No cache hit, fetch from database
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    // Get associated payments
    const { data: payments, error: paymentsError } = await supabase
      .from("payments")
      .select("*")
      .eq("order_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (paymentsError) {
      console.error("Error fetching payments:", paymentsError);
      // Continue without payments data
    }

    const orderDetails = {
      order,
      payments: payments || [],
    };

    // Cache the result
    await CacheService.setOrderDetails(user.id, id, orderDetails);

    const headers = {
      "X-Cache-Status": "MISS",
      "X-Cache-Key": CacheService.getCacheKey("ORDER_DETAILS", user.id, id),
      "X-Data-Source": "SUPABASE_DATABASE",
      "X-Cache-Set": "SUCCESS",
    };

    return NextResponse.json(orderDetails, { headers });
    
  } catch (error) {
    console.error("Error fetching order:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Background refresh function for order details stale-while-revalidate pattern
 */
async function refreshOrderDetailsInBackground(userId: string, orderId: string, supabase: any): Promise<void> {
  try {
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .eq("user_id", userId)
      .single();

    if (orderError || !order) {
      console.error("Error in background order details refresh:", orderError);
      return;
    }

    const { data: payments, error: paymentsError } = await supabase
      .from("payments")
      .select("*")
      .eq("order_id", orderId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (paymentsError) {
      console.error("Error fetching payments in background refresh:", paymentsError);
    }

    const orderDetails = {
      order,
      payments: payments || [],
    };

    await CacheService.setOrderDetails(userId, orderId, orderDetails);
  } catch (error) {
    console.error("Error in background order details refresh:", error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Get the current user from Supabase session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const { id } = resolvedParams;
    const body = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Order ID is required" },
        { status: 400 }
      );
    }

    // Only allow certain fields to be updated by users
    const allowedFields = ["notes"];
    const updateData: any = {};

    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Update the order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "Failed to update order" },
        { status: 400 }
      );
    }

    // Clear orders cache to ensure fresh data on next fetch
    try {
      await CacheService.clearAllOrders(user.id);
      await CacheService.clearOrderDetails(user.id, id);
      console.log(`Orders cache cleared for user: ${user.id} after order update`);
    } catch (cacheError) {
      console.error("Error clearing orders cache after update:", cacheError);
      // Don't fail the update if cache clearing fails
    }

    return NextResponse.json({ order });
    
  } catch (error) {
    console.error("Error updating order:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
