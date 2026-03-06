import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { CreateOrderRequest } from "@/lib/types/order";
import {
  validateAndFetchAddresses,
  validateItemPrices,
  calculateOrderSummary,
} from "@/lib/utils/checkout-helpers";
import { logServerEvent } from "@/lib/services/event-logger";

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

    // Expire any existing pending sessions for this user
    await supabase
      .from("checkout_sessions")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("status", "pending");

    // Create new checkout session
    const { data: session, error: sessionError } = await supabase
      .from("checkout_sessions")
      .insert({
        user_id: user.id,
        customer_email: user.email!,
        customer_phone: shippingRow.phone,
        shipping_address: shippingAddress,
        billing_address: billingAddress,
        items,
        subtotal: orderSummary.subtotal,
        delivery_charge: orderSummary.delivery_charge,
        tax_amount: orderSummary.tax_amount,
        total_amount: orderSummary.total_amount,
        currency: orderSummary.currency,
        notes: notes || null,
        status: "pending",
      })
      .select("id")
      .single();

    if (sessionError || !session) {
      console.error("Error creating checkout session:", sessionError);
      return NextResponse.json(
        { error: "Failed to create checkout session" },
        { status: 500 }
      );
    }

    // Log event (fire-and-forget)
    logServerEvent(supabase, user.id, "checkout_session_created", {
      session_id: session.id,
      total_amount: orderSummary.total_amount,
      item_count: items.length,
    });

    return NextResponse.json({
      session_id: session.id,
      payment_url: `/payment/session/${session.id}`,
    });
  } catch (error) {
    console.error("Error in checkout session creation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
