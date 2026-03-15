import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { CreateOrderRequest } from "@/lib/types/order";
import {
  validateAndFetchAddresses,
  validateItemPrices,
  calculateOrderSummary,
} from "@/lib/utils/checkout-helpers";
import { logServerEvent } from "@/lib/services/event-logger";
import { EARLY_BIRD_OFFER } from "@/lib/config/offers";
import { DELIVERY_CHARGE_INR, FREE_DELIVERY_THRESHOLD } from "@/lib/constants";

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
    const { items, shipping_address_id, billing_address_id, coupon_code, notes } = body;

    await logServerEvent(supabase, user.id, "checkout_request_received", {
      items_count: items?.length ?? 0,
      shipping_address_id: shipping_address_id ?? null,
      billing_address_id: billing_address_id ?? null,
    });

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
      console.error("Address validation error:", addressResult.error, {
        addressId: shipping_address_id,
        userId: user.id,
      });
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

    // Validate coupon and compute server-side discount
    let discountCode: string | null = null
    let discountAmount = 0

    if (coupon_code) {
      const offer = EARLY_BIRD_OFFER
      const isValid =
        offer.enabled &&
        coupon_code === offer.code &&
        new Date() <= offer.expiresAt

      if (!isValid) {
        return NextResponse.json(
          { error: 'invalid_coupon', message: 'This offer has expired or is invalid.' },
          { status: 422 }
        )
      }

      discountCode = offer.code
      discountAmount = Math.floor(orderSummary.subtotal * offer.discountRate)
    }

    // Recompute total with discount applied
    const discountedSubtotal = orderSummary.subtotal - discountAmount
    const serverDeliveryCharge =
      items.length > 0 && discountedSubtotal < FREE_DELIVERY_THRESHOLD
        ? DELIVERY_CHARGE_INR
        : 0
    const finalTotal = discountedSubtotal + serverDeliveryCharge

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
        customer_email: email,
        customer_phone: shippingRow.phone,
        shipping_address: shippingAddress,
        billing_address: billingAddress,
        items,
        subtotal: orderSummary.subtotal,
        discount_code: discountCode,
        discount_amount: discountAmount,
        delivery_charge: serverDeliveryCharge,
        tax_amount: orderSummary.tax_amount,
        total_amount: finalTotal,
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
