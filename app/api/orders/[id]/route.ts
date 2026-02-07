import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import CacheService from "@/lib/services/cache";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createServerSupabaseClient();

    // Get the current user from Supabase session
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

    const resolvedParams = await params;
    const { id } = resolvedParams;

    if (!id) {
      return NextResponse.json(
        { error: "Order ID is required" },
        { status: 400 }
      );
    }

    // Step 1: Try to get from cache (with short timeout to avoid hanging)
    let cachedOrderDetails = null;
    let cacheHit = false;

    let timeoutId: NodeJS.Timeout | null = null;
    try {
      const cachePromise = CacheService.getOrderDetails(user.id, id);
      const timeoutPromise = new Promise<{
        data: null;
        ttl: number;
        isStale: boolean;
      }>((resolve) => {
        timeoutId = setTimeout(() => resolve({ data: null, ttl: 0, isStale: false }), 1500);
      });

      const cacheResult = await Promise.race([cachePromise, timeoutPromise]);

      if (cacheResult.data) {
        cachedOrderDetails = cacheResult.data;
        cacheHit = true;
        console.log(`Cache HIT for order details ${id}, user ${user.id}`);
      }
    } catch (cacheError) {
      console.error("Cache read error, falling back to database:", cacheError);
    } finally {
      // Clear the timeout to prevent memory leaks if cachePromise resolved first
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }

    // Step 2: If cache has data, return it immediately
    if (cacheHit && cachedOrderDetails) {
      return NextResponse.json(cachedOrderDetails, {
        headers: {
          "X-Cache-Status": "HIT",
          "X-Data-Source": "CACHE",
        },
      });
    }

    // Step 3: Cache miss - fetch from database
    console.log(
      `Cache MISS for order details ${id}, user ${user.id}, fetching from database`
    );
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
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

    console.log(
      `Fetched order details ${id} from database for user ${user.id}`
    );

    // Step 4: Return data to user immediately
    const response = NextResponse.json(orderDetails, {
      headers: {
        "X-Cache-Status": "MISS",
        "X-Data-Source": "DATABASE",
      },
    });

    // Step 5: Cache in background (fire and forget - don't block response)
    CacheService.setOrderDetails(user.id, id, orderDetails)
      .then(() => {
        console.log(
          `Background cache set SUCCESS for order ${id}, user ${user.id}`
        );
      })
      .catch((err) => {
        console.error(
          `Background cache set FAILED for order ${id}, user ${user.id}:`,
          err
        );
      });

    return response;
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
async function refreshOrderDetailsInBackground(
  userId: string,
  orderId: string,
  supabase: any
): Promise<void> {
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
      console.error(
        "Error fetching payments in background refresh:",
        paymentsError
      );
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

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createServerSupabaseClient();

    // Get the current user from Supabase session
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

    // Clear orders cache in background (fire and forget)
    Promise.all([
      CacheService.clearAllOrders(user.id),
      CacheService.clearOrderDetails(user.id, id),
    ])
      .then(() => {
        console.log(`Cache cleared for user: ${user.id} after order update`);
      })
      .catch((cacheError) => {
        console.error("Error clearing cache after update:", cacheError);
      });

    return NextResponse.json({ order });
  } catch (error) {
    console.error("Error updating order:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
