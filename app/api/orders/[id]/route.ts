import { NextRequest, NextResponse } from "next/server";
import CacheService from "@/lib/services/cache";
import { mapOrderItems } from "@/lib/utils/order-mapper";
import {
  effectiveUserErrorResponse,
  getEffectiveUser,
} from "@/lib/services/effective-user";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const result = await getEffectiveUser();
    if (!result.ok) {
      return effectiveUserErrorResponse(result, {
        unauthenticatedMessage: "Authentication required",
      });
    }
    const { userId, client } = result;

    const resolvedParams = await params;
    const { id } = resolvedParams;

    if (!id) {
      return NextResponse.json(
        { error: "Order ID is required" },
        { status: 400 }
      );
    }

    let cachedOrderDetails = null;
    let cacheHit = false;

    let timeoutId: NodeJS.Timeout | null = null;
    try {
      const cachePromise = CacheService.getOrderDetails(userId, id);
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
        console.log(`Cache HIT for order details ${id}, user ${userId}`);
      }
    } catch (cacheError) {
      console.error("Cache read error, falling back to database:", cacheError);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }

    if (cacheHit && cachedOrderDetails) {
      return NextResponse.json(cachedOrderDetails, {
        headers: {
          "X-Cache-Status": "HIT",
          "X-Data-Source": "CACHE",
        },
      });
    }

    console.log(
      `Cache MISS for order details ${id}, user ${userId}, fetching from database`
    );
    const { data: rawOrder, error: orderError } = await client
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (orderError || !rawOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const { order_items, ...orderFields } = rawOrder;
    const order = {
      ...orderFields,
      items: mapOrderItems(order_items ?? []),
    };

    const { data: payments, error: paymentsError } = await client
      .from("payments")
      .select("*")
      .eq("order_id", id)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (paymentsError) {
      console.error("Error fetching payments:", paymentsError);
    }

    const orderDetails = {
      order,
      payments: payments || [],
    };

    console.log(
      `Fetched order details ${id} from database for user ${userId}`
    );

    const response = NextResponse.json(orderDetails, {
      headers: {
        "X-Cache-Status": "MISS",
        "X-Data-Source": "DATABASE",
      },
    });

    CacheService.setOrderDetails(userId, id, orderDetails)
      .then(() => {
        console.log(
          `Background cache set SUCCESS for order ${id}, user ${userId}`
        );
      })
      .catch((err) => {
        console.error(
          `Background cache set FAILED for order ${id}, user ${userId}:`,
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


export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const result = await getEffectiveUser();
    if (!result.ok) {
      return effectiveUserErrorResponse(result, {
        unauthenticatedMessage: "Authentication required",
      });
    }
    const { userId, client } = result;

    const resolvedParams = await params;
    const { id } = resolvedParams;
    const body = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Order ID is required" },
        { status: 400 }
      );
    }

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

    const { data: order, error: orderError } = await client
      .from("orders")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "Failed to update order" },
        { status: 400 }
      );
    }

    Promise.all([
      CacheService.clearAllOrders(userId),
      CacheService.clearOrderDetails(userId, id),
    ])
      .then(() => {
        console.log(`Cache cleared for user: ${userId} after order update`);
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
