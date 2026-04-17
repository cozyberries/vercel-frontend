import { NextRequest, NextResponse } from "next/server";
import type { CreateOrderRequest } from "@/lib/types/order";
import {
  validateAndFetchAddresses,
  validateItemPrices,
  calculateOrderSummary,
  applyAdminOverride,
} from "@/lib/utils/checkout-helpers";
import { logServerEvent } from "@/lib/services/event-logger";
import { notifyCheckoutInitiated } from "@/lib/services/telegram";
import { validateAndApplyOffer } from "@/lib/utils/offers-server";
import { DELIVERY_CHARGE_INR, FREE_DELIVERY_THRESHOLD } from "@/lib/constants";
import {
  effectiveUserErrorResponse,
  getEffectiveUser,
} from "@/lib/services/effective-user";

export async function POST(request: NextRequest) {
  try {
    const result = await getEffectiveUser();
    if (!result.ok) {
      return effectiveUserErrorResponse(result, {
        unauthenticatedMessage: "Authentication required",
      });
    }
    const { userId, actingAdminId, client, effectiveUser, sessionUser } = result;

    const email = effectiveUser.email?.trim();
    if (!email) {
      return NextResponse.json(
        { error: "Account email is required for checkout" },
        { status: 400 }
      );
    }

    const body: CreateOrderRequest = await request.json();
    const {
      items,
      shipping_address_id,
      billing_address_id,
      coupon_code,
      notes,
      admin_override,
    } = body;

    await logServerEvent(client, userId, "checkout_request_received", {
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

    // Admin override is only allowed under shadow mode.
    if (admin_override && !actingAdminId) {
      return NextResponse.json(
        { error: "Admin override not allowed outside shadow mode" },
        { status: 403 }
      );
    }

    const addressResult = await validateAndFetchAddresses(
      client,
      userId,
      shipping_address_id,
      billing_address_id
    );

    if ("error" in addressResult) {
      console.error("Address validation error:", addressResult.error, {
        addressId: shipping_address_id,
        userId,
      });
      return NextResponse.json(
        { error: addressResult.error },
        { status: 400 }
      );
    }

    const priceError = await validateItemPrices(client, items);
    if (priceError) {
      return NextResponse.json(
        { error: priceError },
        { status: 400 }
      );
    }

    const orderSummary = calculateOrderSummary(items);

    let discountCode: string | null = null;
    let discountAmount = 0;
    const trimmedCustomerNotes = notes?.trim();
    let sessionNotes: string | null =
      trimmedCustomerNotes && trimmedCustomerNotes.length > 0
        ? trimmedCustomerNotes
        : null;

    if (admin_override && actingAdminId) {
      const overrideResult = applyAdminOverride({
        override: admin_override,
        subtotal: orderSummary.subtotal,
        actingAdminEmail: sessionUser.email ?? null,
        existingNotes: sessionNotes,
      });

      if (!overrideResult.ok) {
        return NextResponse.json(
          { error: overrideResult.error },
          { status: 400 }
        );
      }

      discountCode = overrideResult.discountCode;
      discountAmount = overrideResult.discountAmount;
      sessionNotes = overrideResult.notes;
      // coupon_code is intentionally ignored when admin override is applied.
    } else if (coupon_code) {
      const offerResult = validateAndApplyOffer(coupon_code, orderSummary.subtotal);
      if (!offerResult.ok) {
        return NextResponse.json(
          { error: "invalid_coupon", message: offerResult.error },
          { status: 422 }
        );
      }
      discountCode = offerResult.data.discountCode;
      discountAmount = offerResult.data.discountAmount;
    }

    const discountedSubtotal = orderSummary.subtotal - discountAmount;
    const serverDeliveryCharge =
      items.length > 0 && discountedSubtotal < FREE_DELIVERY_THRESHOLD
        ? DELIVERY_CHARGE_INR
        : 0;
    const finalTotal = discountedSubtotal + serverDeliveryCharge;

    const { shippingAddress, billingAddress, shippingRow } = addressResult.data;

    await client
      .from("checkout_sessions")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("status", "pending");

    const { data: session, error: sessionError } = await client
      .from("checkout_sessions")
      .insert({
        user_id: userId,
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
        notes: sessionNotes,
        status: "pending",
        placed_by_admin_id: actingAdminId ?? null,
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

    notifyCheckoutInitiated({
      email,
      phone: shippingRow.phone ?? null,
      itemCount: items.length,
    });

    logServerEvent(client, userId, "checkout_session_created", {
      session_id: session.id,
      total_amount: finalTotal,
      item_count: items.length,
    });

    if (admin_override && actingAdminId) {
      logServerEvent(client, userId, "admin_override_applied", {
        session_id: session.id,
        discount_amount: discountAmount,
        actor_id: actingAdminId,
      });
    }

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
