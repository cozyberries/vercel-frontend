import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type {
  CreateOrderRequest,
  OrderCreate,
  OrderSummary,
} from "@/lib/types/order";
import type { CartItem } from "@/components/cart-context";
import CacheService from "@/lib/services/cache";

// Track ongoing background refreshes to prevent duplicates
const refreshingOrders = new Map<string, Set<string>>();

export async function POST(request: NextRequest) {
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

    const body: CreateOrderRequest = await request.json();
    const { items, shipping_address_id, billing_address_id, notes } = body;

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Items are required" },
        { status: 400 }
      );
    }

    if (!shipping_address_id) {
      return NextResponse.json(
        { error: "Shipping address is required" },
        { status: 400 }
      );
    }

    // Get shipping address
    const { data: shippingAddress, error: shippingError } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("id", shipping_address_id)
      .eq("user_id", user.id)
      .single();

    if (shippingError || !shippingAddress) {
      return NextResponse.json(
        { error: "Invalid shipping address" },
        { status: 400 }
      );
    }

    // Get billing address if provided, otherwise use shipping address
    let billingAddress = shippingAddress;
    if (billing_address_id && billing_address_id !== shipping_address_id) {
      const { data: billingAddr, error: billingError } = await supabase
        .from("user_addresses")
        .select("*")
        .eq("id", billing_address_id)
        .eq("user_id", user.id)
        .single();

      if (billingError || !billingAddr) {
        return NextResponse.json(
          { error: "Invalid billing address" },
          { status: 400 }
        );
      }
      billingAddress = billingAddr;
    }

    // Calculate order totals
    const orderSummary = calculateOrderSummary(items);

    // Prepare order data
    const orderData: OrderCreate = {
      user_id: user.id,
      customer_email: user.email!,
      customer_phone: shippingAddress.phone,
      shipping_address: {
        full_name: shippingAddress.full_name,
        address_line_1: shippingAddress.address_line_1,
        address_line_2: shippingAddress.address_line_2,
        city: shippingAddress.city,
        state: shippingAddress.state,
        postal_code: shippingAddress.postal_code,
        country: shippingAddress.country,
        phone: shippingAddress.phone,
        address_type: shippingAddress.address_type,
        label: shippingAddress.label,
      },
      billing_address: {
        full_name: billingAddress.full_name,
        address_line_1: billingAddress.address_line_1,
        address_line_2: billingAddress.address_line_2,
        city: billingAddress.city,
        state: billingAddress.state,
        postal_code: billingAddress.postal_code,
        country: billingAddress.country,
        phone: billingAddress.phone,
        address_type: billingAddress.address_type,
        label: billingAddress.label,
      },
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        image: item.image,
      })),
      subtotal: orderSummary.subtotal,
      delivery_charge: orderSummary.delivery_charge,
      tax_amount: orderSummary.tax_amount,
      total_amount: orderSummary.total_amount,
      currency: orderSummary.currency,
      notes,
    };

    // Create the order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert(orderData)
      .select()
      .single();

    if (orderError) {
      console.error("Error creating order:", orderError);
      return NextResponse.json(
        { error: "Failed to create order" },
        { status: 500 }
      );
    }

    // Clear orders cache in background (fire and forget)
    CacheService.clearAllOrders(user.id)
      .then(() => {
        console.log(`Cache cleared for user: ${user.id} after order creation`);
      })
      .catch((cacheError) => {
        console.error("Error clearing orders cache:", cacheError);
      });

    // Generate payment URL for the dummy payment page
    const paymentUrl = `/payment/${order.id}`;

    return NextResponse.json({
      order,
      payment_url: paymentUrl,
    });
  } catch (error) {
    console.error("Error in order creation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "10");
    const offset = parseInt(searchParams.get("offset") || "0");
    const status = searchParams.get("status");

    // Create cache key based on filters
    const filters = `limit:${limit}-offset:${offset}${
      status ? `-status:${status}` : ""
    }`;

    // Step 1: Try to get from cache (with short timeout to avoid hanging)
    let cachedOrders = null;
    let cacheHit = false;

    try {
      const cachePromise = CacheService.getOrders(user.id, filters);
      const timeoutPromise = new Promise<{
        data: null;
        ttl: number;
        isStale: boolean;
      }>((resolve) =>
        setTimeout(() => resolve({ data: null, ttl: 0, isStale: false }), 1500)
      );

      const cacheResult = await Promise.race([cachePromise, timeoutPromise]);

      if (cacheResult.data && Array.isArray(cacheResult.data)) {
        cachedOrders = cacheResult.data;
        cacheHit = true;
        console.log(
          `Cache HIT for user ${user.id}, found ${cachedOrders.length} orders`
        );
      }
    } catch (cacheError) {
      console.error("Cache read error, falling back to database:", cacheError);
    }

    // Step 2: If cache has data, return it immediately
    if (cacheHit && cachedOrders) {
      return NextResponse.json(
        { orders: cachedOrders },
        {
          headers: {
            "X-Cache-Status": "HIT",
            "X-Data-Source": "CACHE",
          },
        }
      );
    }

    // Step 3: Cache miss - fetch from database
    console.log(`Cache MISS for user ${user.id}, fetching from database`);

    let query = supabase
      .from("orders")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    const { data: orders, error: ordersError } = await query;

    if (ordersError) {
      console.error("Error fetching orders from database:", ordersError);
      return NextResponse.json(
        { error: "Failed to fetch orders" },
        { status: 500 }
      );
    }

    console.log(
      `Fetched ${orders?.length || 0} orders from database for user ${user.id}`
    );

    // Step 4: Return data to user immediately
    const response = NextResponse.json(
      { orders: orders || [] },
      {
        headers: {
          "X-Cache-Status": "MISS",
          "X-Data-Source": "DATABASE",
        },
      }
    );

    // Step 5: Cache in background (fire and forget - don't block response)
    if (orders && orders.length >= 0) {
      CacheService.setOrders(user.id, orders, filters)
        .then(() => {
          console.log(`Background cache set SUCCESS for user ${user.id}`);
        })
        .catch((err) => {
          console.error(
            `Background cache set FAILED for user ${user.id}:`,
            err
          );
        });
    }

    return response;
  } catch (error) {
    console.error("Error in order fetching:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Background refresh function for stale-while-revalidate pattern
 */
async function refreshOrdersInBackground(
  userId: string,
  options: { limit: number; offset: number; status: string | null },
  supabase: any
): Promise<void> {
  try {
    let query = supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(options.offset, options.offset + options.limit - 1);

    if (options.status) {
      query = query.eq("status", options.status);
    }

    const { data: orders, error } = await query;

    if (error) {
      console.error("Error in background orders refresh:", error);
      return;
    }

    const filters = `limit:${options.limit}-offset:${options.offset}${
      options.status ? `-status:${options.status}` : ""
    }`;
    await CacheService.setOrders(userId, orders || [], filters);
  } catch (error) {
    console.error("Error in background orders refresh:", error);
  }
}

function calculateOrderSummary(items: CartItem[]): OrderSummary {
  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const delivery_charge = items.length > 0 ? 50 : 0; // ₹50 delivery charge
  const tax_amount = subtotal * 0.1; // 10% tax
  const total_amount = subtotal + delivery_charge + tax_amount;

  return {
    subtotal,
    delivery_charge,
    tax_amount,
    total_amount,
    currency: "INR",
  };
}
