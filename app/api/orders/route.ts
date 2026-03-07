import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { CreateOrderRequest, OrderCreate } from "@/lib/types/order";
import { mapOrderItems, mapOrderItemInputs } from "@/lib/utils/order-mapper";
import {
  validateAndFetchAddresses,
  validateItemPrices,
  calculateOrderSummary,
} from "@/lib/utils/checkout-helpers";

export async function POST(request: NextRequest) {
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

    const email = user.email?.trim();
    if (!email) {
      return NextResponse.json(
        { error: "Account email is required for checkout" },
        { status: 400 }
      );
    }

    const body: CreateOrderRequest = await request.json();
    const { items, shipping_address_id, billing_address_id, notes } = body;

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

    // Validate addresses
    const addressResult = await validateAndFetchAddresses(
      supabase,
      user.id,
      shipping_address_id,
      billing_address_id
    );

    if ("error" in addressResult) {
      return NextResponse.json(
        { error: addressResult.error },
        { status: 400 }
      );
    }

    // Server-side price validation
    const priceError = await validateItemPrices(supabase, items);
    if (priceError) {
      return NextResponse.json(
        { error: priceError },
        { status: 400 }
      );
    }

    const orderSummary = calculateOrderSummary(items);
    const { shippingAddress, billingAddress, shippingRow } = addressResult.data;

    const orderData: OrderCreate = {
      user_id: user.id,
      customer_email: email,
      customer_phone: shippingRow.phone,
      shipping_address: shippingAddress,
      billing_address: billingAddress,
      subtotal: orderSummary.subtotal,
      delivery_charge: orderSummary.delivery_charge,
      tax_amount: orderSummary.tax_amount,
      total_amount: orderSummary.total_amount,
      currency: orderSummary.currency,
      notes,
    };

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert(orderData)
      .select()
      .single();

    if (orderError || !order) {
      console.error("Error creating order:", orderError);
      return NextResponse.json(
        { error: "Failed to create order" },
        { status: 500 }
      );
    }

    // Insert each line-item into the normalised order_items table
    const itemRows = items.map((item) => ({
      order_id: order.id,
      product_id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      image: item.image ?? null,
      size: item.size ?? null,
      color: item.color ?? null,
      sku: item.sku ?? null,
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(itemRows);

    if (itemsError) {
      // Compensate: delete the orphaned order so the DB stays consistent.
      // NOTE: this is not atomic — a Supabase RPC wrapping both inserts in a
      // Postgres transaction would be strictly more robust.
      const { error: deleteError } = await supabase
        .from("orders")
        .delete()
        .eq("id", order.id);
      if (deleteError) {
        console.error("Compensating order delete failed — orphaned order may require manual cleanup:", {
          deleteError,
          orderId: order.id,
        });
      }
      console.error("Error inserting order items:", itemsError);
      return NextResponse.json(
        { error: "Failed to save order items" },
        { status: 500 }
      );
    }

    // Attach items to the response so the client can redirect immediately.
    const orderWithItems = {
      ...order,
      items: mapOrderItemInputs(items),
    };

    return NextResponse.json({
      order: orderWithItems,
      payment_url: `/payment/${order.id}`,
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

    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (ordersError) {
      console.error("Error fetching orders from database:", ordersError);
      return NextResponse.json(
        { error: "Failed to fetch orders" },
        { status: 500 }
      );
    }

    const mapped = (orders || []).map(({ order_items, ...order }) => ({
      ...order,
      items: mapOrderItems(order_items ?? []),
    }));

    return NextResponse.json({ orders: mapped });
  } catch (error) {
    console.error("Error in order fetching:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

