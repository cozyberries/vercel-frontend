import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type {
  CreateOrderRequest,
  OrderCreate,
  OrderSummary,
  OrderItemInput,
} from "@/lib/types/order";
import { mapOrderItems, mapOrderItemInputs } from "@/lib/utils/order-mapper";
import { DELIVERY_CHARGE_INR, FREE_DELIVERY_THRESHOLD, GST_RATE } from "@/lib/constants";

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

    // ── Server-side price validation ─────────────────────────────────────────
    // Collect every unique product slug referenced in the cart.
    const productSlugs = [...new Set(items.map((item) => item.id))];

    // Fetch base prices from the products table (slug is the PK).
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("slug, price")
      .in("slug", productSlugs);

    if (productsError) {
      console.error("Error fetching product prices:", productsError);
      return NextResponse.json(
        { error: "Failed to validate product prices" },
        { status: 500 }
      );
    }

    // Fetch all variant prices for the same products so size-specific prices
    // (which may differ from the base price) are also accepted.
    const { data: variants, error: variantsError } = await supabase
      .from("product_variants")
      .select("product_slug, price")
      .in("product_slug", productSlugs);

    if (variantsError) {
      console.error("Error fetching variant prices:", variantsError);
      return NextResponse.json(
        { error: "Failed to validate product prices" },
        { status: 500 }
      );
    }

    // Build a map: product_slug → Set of all valid prices (base + variants).
    const validPriceMap = new Map<string, Set<number>>();

    for (const product of products ?? []) {
      validPriceMap.set(product.slug, new Set([Number(product.price)]));
    }
    for (const variant of variants ?? []) {
      const set = validPriceMap.get(variant.product_slug) ?? new Set<number>();
      set.add(Number(variant.price));
      validPriceMap.set(variant.product_slug, set);
    }

    // Reject any item whose price is not in the server-authoritative set.
    for (const item of items) {
      const validPrices = validPriceMap.get(item.id);
      if (!validPrices) {
        return NextResponse.json(
          { error: `Product not found: ${item.id}` },
          { status: 400 }
        );
      }
      if (!validPrices.has(item.price)) {
        return NextResponse.json(
          { error: `Invalid price for product ${item.id}` },
          { status: 400 }
        );
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const orderSummary = calculateOrderSummary(items);

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Converts rupees to paise (smallest unit) for integer-safe arithmetic. */
function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Rounds to 2 decimal places for final display conversion from paise. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const FREE_DELIVERY_THRESHOLD_PAISE = Math.round(FREE_DELIVERY_THRESHOLD * 100);
const DELIVERY_CHARGE_PAISE = Math.round(DELIVERY_CHARGE_INR * 100);
const GST_PERCENT = Math.round(GST_RATE * 100); // integer percentage for exact calculation

function calculateOrderSummary(items: OrderItemInput[]): OrderSummary {
  if (items.length === 0) {
    return {
      subtotal: 0,
      delivery_charge: 0,
      tax_amount: 0,
      total_amount: 0,
      currency: "INR",
    };
  }

  const subtotal_paise = items.reduce(
    (sum, item) => sum + rupeesToPaise(item.price) * item.quantity,
    0
  );

  const delivery_charge_paise =
    subtotal_paise < FREE_DELIVERY_THRESHOLD_PAISE ? DELIVERY_CHARGE_PAISE : 0;

  const tax_paise = Math.round((subtotal_paise * GST_PERCENT) / 100);

  const total_paise = subtotal_paise + delivery_charge_paise + tax_paise;

  return {
    subtotal: round2(subtotal_paise / 100),
    delivery_charge: round2(delivery_charge_paise / 100),
    tax_amount: round2(tax_paise / 100),
    total_amount: round2(total_paise / 100),
    currency: "INR",
  };
}
