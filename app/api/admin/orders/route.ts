import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { authenticateRequest } from "@/lib/jwt-auth";
import type { OrderCreate, OrderStatus } from "@/lib/types/order";

export async function POST(request: NextRequest) {
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

    // Validate required fields
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "Items are required" },
        { status: 400 }
      );
    }

    if (!body.customer_email) {
      return NextResponse.json(
        { error: "Customer email is required" },
        { status: 400 }
      );
    }

    if (!body.shipping_address) {
      return NextResponse.json(
        { error: "Shipping address is required" },
        { status: 400 }
      );
    }

    // Find or validate user_id
    let userId: string | null = body.user_id || null;

    // If user_id is provided, validate it exists
    if (userId) {
      const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId);
      if (userError || !user.user) {
        // Invalid user_id, try to find user by email
        userId = null;
      }
    }

    // If no valid user_id, try to find user by email
    if (!userId && body.customer_email) {
      const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
      if (!listError && authUsers?.users) {
        const userByEmail = authUsers.users.find(
          (u) => u.email?.toLowerCase() === body.customer_email.toLowerCase()
        );
        if (userByEmail) {
          userId = userByEmail.id;
        }
      }
    }

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Prepare order data
    const orderData: OrderCreate & { status?: OrderStatus; order_number?: string } = {
      user_id: userId || "",
      customer_email: body.customer_email,
      customer_phone: body.customer_phone,
      shipping_address: body.shipping_address,
      billing_address: body.billing_address,
      items: body.items,
      subtotal: body.subtotal,
      delivery_charge: body.delivery_charge || 0,
      tax_amount: body.tax_amount || 0,
      total_amount: body.total_amount,
      currency: body.currency || "INR",
      notes: body.notes,
      status: body.status || "payment_pending",
      order_number: orderNumber,
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
        { error: `Failed to create order: ${orderError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    console.error("Error creating order:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const status = searchParams.get("status");
    const fromDate = searchParams.get("from_date");
    const toDate = searchParams.get("to_date");

    let query = supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    // Apply date filters
    if (fromDate) {
      query = query.gte("created_at", fromDate);
    }
    if (toDate) {
      // Add end of day to toDate to include the entire day
      const endOfDay = new Date(toDate);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.lte("created_at", endOfDay.toISOString());
    }

    const { data: orders, error: ordersError } = await query;

    if (ordersError) {
      console.error("Database query error:", ordersError);
      return NextResponse.json(
        { error: "Failed to fetch orders: " + ordersError.message },
        { status: 500 }
      );
    }

    console.log(`Fetched ${orders?.length || 0} orders from database`);

    return NextResponse.json({
      orders: orders || [],
      total: orders?.length || 0,
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 }
    );
  }
}
