import { NextRequest, NextResponse } from "next/server";
import type { CreateOrderRequest, OrderCreate, OrderStatus } from "@/lib/types/order";
import { mapOrderItems, mapOrderItemInputs } from "@/lib/utils/order-mapper";
import {
  validateAndFetchAddresses,
  validateItemPrices,
  calculateOrderSummary,
  applyAdminOverride,
} from "@/lib/utils/checkout-helpers";
import { validateAndApplyOffer } from "@/lib/utils/offers-server";
import { DELIVERY_CHARGE_INR, FREE_DELIVERY_THRESHOLD } from "@/lib/constants";
import { notifyAdminsOrderPlacedFromCheckout } from "@/lib/services/admin-order-notifications";
import { notifyOrderPlaced } from "@/lib/services/telegram";
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
    let orderNotes: string | undefined = notes;

    if (admin_override && actingAdminId) {
      const overrideResult = applyAdminOverride({
        override: admin_override,
        subtotal: orderSummary.subtotal,
        actingAdminEmail: sessionUser.email ?? null,
        existingNotes: notes ?? null,
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
    const serverDeliveryCharge =
      items.length > 0 && discountedSubtotal < FREE_DELIVERY_THRESHOLD
        ? DELIVERY_CHARGE_INR
        : 0;
    const finalTotal = discountedSubtotal + serverDeliveryCharge;

    const { shippingAddress, billingAddress, shippingRow } = addressResult.data;

    const orderData: OrderCreate = {
      user_id: userId,
      customer_email: email,
      customer_phone: shippingRow.phone,
      shipping_address: shippingAddress,
      billing_address: billingAddress,
      subtotal: orderSummary.subtotal,
      discount_code: discountCode ?? undefined,
      discount_amount: discountAmount,
      delivery_charge: serverDeliveryCharge,
      tax_amount: orderSummary.tax_amount,
      total_amount: finalTotal,
      currency: orderSummary.currency,
      notes: orderNotes,
      placed_by_admin_id: actingAdminId,
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

    const { error: itemsError } = await client
      .from("order_items")
      .insert(itemRows);

    if (itemsError) {
      // Compensate: delete the orphaned order so the DB stays consistent.
      // NOTE: this is not atomic — a Supabase RPC wrapping both inserts in a
      // Postgres transaction would be strictly more robust.
      const { error: deleteError } = await client
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
      logImpersonationEvent({
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
    }

    await notifyAdminsOrderPlacedFromCheckout({
      id: order.id,
      order_number: order.order_number,
      status: order.status as OrderStatus,
      total_amount: order.total_amount,
      currency: order.currency,
      customer_email: email,
      customer_name: shippingAddress.full_name,
    });
    notifyOrderPlaced({
      orderNumber: order.order_number,
      orderStatus: order.status,
      email,
      phone: shippingRow.phone ?? null,
      shippingAddress,
      totalAmount: order.total_amount,
      subtotal: orderSummary.subtotal,
      deliveryCharge: serverDeliveryCharge,
      discountCode: discountCode,
      discountAmount: discountAmount,
      items: items.map((i) => ({ name: i.name, quantity: i.quantity, size: i.size ?? null })),
    });

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
