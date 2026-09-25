import { NextRequest, NextResponse, after } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import type { CreateOrderRequest, OrderCreate, OrderStatus, ShippingAddress } from "@/lib/types/order";
import { mapOrderItems, mapOrderItemInputs } from "@/lib/utils/order-mapper";
import {
  validateAndFetchAddresses,
  validateItemPrices,
  calculateOrderSummary,
  applyAdminOverride,
} from "@/lib/utils/checkout-helpers";
import { validateAndApplyOffer } from "@/lib/utils/offers-server";
import { deliveryChargeFor, parseFulfilmentMethod } from "@/lib/utils/fulfilment";
import { resolveOrderVariants } from "@/lib/utils/variant-resolver";
import { resolveGstStateCode } from "@/lib/invoice/state-codes";
import { getIndianPhoneDigits } from "@/lib/utils/validation";
import { SELLER } from "@/lib/config/business";
import { notifyAdminsOrderPlacedFromCheckout } from "@/lib/services/admin-order-notifications";
import { notifyNewOrder } from "@/lib/services/telegram";
import {
  effectiveUserErrorResponse,
  getEffectiveUser,
} from "@/lib/services/effective-user";
import {
  extractRequestMetadata,
  logImpersonationEvent,
} from "@/lib/services/impersonation-audit";

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
      fulfilment_method,
    } = body;

    if (admin_override && !actingAdminId) {
      return NextResponse.json(
        { error: "Admin override not allowed outside shadow mode" },
        { status: 403 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Items are required" },
        { status: 400 }
      );
    }

    const fulfilment = parseFulfilmentMethod(fulfilment_method);
    if (!fulfilment) {
      return NextResponse.json(
        { error: "Invalid fulfilment method" },
        { status: 400 }
      );
    }

    let shippingAddress: (ShippingAddress & { phone?: string }) | null = null;
    let billingAddress: (ShippingAddress & { phone?: string }) | null = null;
    let customerPhone: string | null;
    let customerName: string | null;
    let placeOfSupply: string | null;

    if (fulfilment === "delivery") {
      if (!shipping_address_id) {
        return NextResponse.json(
          { error: "Shipping address is required" },
          { status: 400 }
        );
      }

      const addressResult = await validateAndFetchAddresses(
        client,
        userId,
        shipping_address_id,
        billing_address_id
      );

      if ("error" in addressResult) {
        return NextResponse.json(
          { error: addressResult.error },
          { status: 400 }
        );
      }

      shippingAddress = addressResult.data.shippingAddress;
      billingAddress = addressResult.data.billingAddress;
      customerPhone = addressResult.data.shippingRow.phone ?? null;
      customerName = shippingAddress.full_name ?? null;
      placeOfSupply = resolveGstStateCode(shippingAddress.state);
    } else {
      // Pickup: no address. The phone is the account's OTP-verified number,
      // which staff use to hand over the order and send the bill.
      const phoneDigits = getIndianPhoneDigits(effectiveUser.phone ?? "");
      if (phoneDigits.length !== 10) {
        return NextResponse.json(
          { error: "Add a phone number to your account to choose pickup" },
          { status: 400 }
        );
      }
      customerPhone = phoneDigits;
      const metaName = (effectiveUser.user_metadata as { full_name?: unknown } | undefined)?.full_name;
      customerName = typeof metaName === "string" && metaName.trim() ? metaName.trim() : null;
      placeOfSupply = SELLER.stateCode;
    }

    const priceError = await validateItemPrices(client, items);
    if (priceError) {
      return NextResponse.json(
        { error: priceError },
        { status: 400 }
      );
    }

    const variants = await resolveOrderVariants(client, items);
    if (!variants.ok) {
      return NextResponse.json(
        { error: variants.error },
        { status: variants.status }
      );
    }

    const orderSummary = calculateOrderSummary(items);

    let discountCode: string | null = null;
    let discountAmount = 0;
    const trimmedCustomerNotes = notes?.trim();
    const normalizedCustomerNotes =
      trimmedCustomerNotes && trimmedCustomerNotes.length > 0
        ? trimmedCustomerNotes
        : null;
    let orderNotes: string | null = normalizedCustomerNotes;

    if (admin_override && actingAdminId) {
      const overrideResult = applyAdminOverride({
        override: admin_override,
        subtotal: orderSummary.subtotal,
        actingAdminEmail: sessionUser.email ?? null,
        existingNotes: normalizedCustomerNotes,
      });

      if (!overrideResult.ok) {
        return NextResponse.json(
          { error: overrideResult.error },
          { status: 400 }
        );
      }

      discountCode = overrideResult.discountCode;
      discountAmount = overrideResult.discountAmount;
      orderNotes = overrideResult.notes;
      // coupon_code is intentionally ignored when admin_override is applied.
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
    const serverDeliveryCharge = deliveryChargeFor(discountedSubtotal, fulfilment, items.length);
    const finalTotal = discountedSubtotal + serverDeliveryCharge;

    const orderData: OrderCreate = {
      user_id: userId,
      customer_email: email,
      customer_phone: customerPhone ?? undefined,
      customer_name: customerName,
      shipping_address: shippingAddress,
      billing_address: billingAddress ?? undefined,
      subtotal: orderSummary.subtotal,
      discount_code: discountCode ?? undefined,
      discount_amount: discountAmount,
      delivery_charge: serverDeliveryCharge,
      tax_amount: orderSummary.tax_amount,
      total_amount: finalTotal,
      currency: orderSummary.currency,
      notes: orderNotes ?? undefined,
      placed_by_admin_id: actingAdminId,
      fulfilment_method: fulfilment,
      place_of_supply: placeOfSupply,
    };

    const { data: order, error: orderError } = await client
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

    const itemRows = items.map((item, index) => ({
      order_id: order.id,
      product_id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      image: item.image ?? null,
      size: item.size ?? null,
      color: item.color ?? null,
      sku: variants.skus[index],
    }));

    const { error: itemsError } = await client
      .from("order_items")
      .insert(itemRows);

    if (itemsError) {
      // Compensate: delete the orphaned order so the DB stays consistent.
      // `authenticated` no longer has DELETE on `orders` (deny-by-default RLS
      // remediation), so this compensating delete runs through the
      // service-role client rather than the caller's session client.
      // NOTE: this is not atomic — a Supabase RPC wrapping both inserts in a
      // Postgres transaction would be strictly more robust.
      const adminClient = createAdminSupabaseClient();
      const { error: deleteError } = await adminClient
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

    if (actingAdminId) {
      const { ip, user_agent } = extractRequestMetadata(request);
      try {
        await logImpersonationEvent({
          actor_id: actingAdminId,
          target_id: userId,
          event_type: "order_placed",
          order_id: order.id,
          ip,
          user_agent,
          metadata: {
            order_number: order.order_number,
            override_applied: Boolean(admin_override),
          },
        });
      } catch (auditError) {
        console.error(
          "Failed to record impersonation audit for order_placed:",
          {
            auditError,
            actor_id: actingAdminId,
            target_id: userId,
            order_id: order.id,
          }
        );
      }
    }

    await notifyAdminsOrderPlacedFromCheckout({
      id: order.id,
      order_number: order.order_number,
      status: order.status as OrderStatus,
      total_amount: order.total_amount,
      currency: order.currency,
      customer_email: email,
      customer_name: customerName ?? email,
    });
    // after(): the owner confirms from this message, so it must not be lost
    // when the function is frozen after the response.
    after(() => notifyNewOrder(
      {
        orderId: order.id,
        orderNumber: order.order_number,
        email,
        phone: customerPhone,
        shippingAddress,
        totalAmount: order.total_amount,
        subtotal: orderSummary.subtotal,
        deliveryCharge: serverDeliveryCharge,
        discountCode,
        discountAmount,
        items: items.map((i) => ({ name: i.name, quantity: i.quantity, size: i.size ?? null })),
        fulfilmentMethod: fulfilment,
        customerName,
        placedByEmail: actingAdminId ? sessionUser.email ?? null : null,
      },
      { header: "🛒 <b>New Order Placed</b>" }
    ));

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
    const result = await getEffectiveUser();
    if (!result.ok) {
      return effectiveUserErrorResponse(result, {
        unauthenticatedMessage: "Authentication required",
      });
    }
    const { userId, client } = result;

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "10");
    const offset = parseInt(searchParams.get("offset") || "0");

    const { data: orders, error: ordersError } = await client
      .from("orders")
      .select("*, order_items(*)")
      .eq("user_id", userId)
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
