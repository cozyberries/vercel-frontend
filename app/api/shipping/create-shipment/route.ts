import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  fetchWaybill,
  createShipment,
} from "@/lib/utils/shipping-helpers";
import type { ShippingAddress } from "@/lib/types/order";

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

    const { order_id } = await request.json();

    if (!order_id) {
      return NextResponse.json(
        { error: "order_id is required" },
        { status: 400 }
      );
    }

    // Fetch the order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    // Check order is in correct state (payment_confirmed or processing)
    if (!["payment_confirmed", "processing"].includes(order.status)) {
      return NextResponse.json(
        { error: `Cannot create shipment for order in ${order.status} status` },
        { status: 400 }
      );
    }

    // Prevent duplicate shipments
    if (order.delhivery_waybill) {
      return NextResponse.json(
        {
          error: "Shipment already created",
          waybill: order.delhivery_waybill,
        },
        { status: 409 }
      );
    }

    const shippingAddress: ShippingAddress = order.shipping_address;
    const items = order.order_items || [];

    // Step 1: Fetch a waybill number from Delhivery
    let waybill: string;
    try {
      waybill = await fetchWaybill();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Waybill fetch failed";
      await supabase
        .from("orders")
        .update({
          shipment_creation_error: `Waybill: ${errorMsg}`,
          shipment_creation_attempts: (order.shipment_creation_attempts || 0) + 1,
        })
        .eq("id", order_id);

      return NextResponse.json({ error: errorMsg }, { status: 502 });
    }

    // Step 2: Create shipment in Delhivery
    const productDesc = items
      .map((i: { name: string; quantity: number }) => `${i.name} x${i.quantity}`)
      .join(", ");
    const totalQty = items.reduce((sum: number, i: { quantity: number }) => sum + i.quantity, 0);

    // Estimate weight: 200g per item as default
    const estimatedWeight = totalQty * 200;

    try {
      const result = await createShipment({
        waybill,
        orderNumber: order.order_number,
        customerName: shippingAddress.full_name,
        customerPhone: shippingAddress.phone || order.customer_phone || "",
        customerAddress: [
          shippingAddress.address_line_1,
          shippingAddress.address_line_2,
        ]
          .filter(Boolean)
          .join(", "),
        customerCity: shippingAddress.city,
        customerState: shippingAddress.state,
        customerPincode: shippingAddress.postal_code,
        customerCountry: shippingAddress.country || "India",
        productDescription: productDesc,
        totalAmount: order.total_amount,
        quantity: totalQty,
        weight: estimatedWeight,
        paymentMode: "Prepaid",
      });

      // Step 3: Update order with shipment details
      await supabase
        .from("orders")
        .update({
          delhivery_waybill: waybill,
          delhivery_order_id: result?.upload_wbn || null,
          tracking_number: waybill,
          status: "processing",
          shipment_created_at: new Date().toISOString(),
          shipment_creation_error: null,
          shipment_creation_attempts: (order.shipment_creation_attempts || 0) + 1,
        })
        .eq("id", order_id);

      return NextResponse.json({
        success: true,
        waybill,
        order_id: result?.upload_wbn || null,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Shipment creation failed";
      await supabase
        .from("orders")
        .update({
          shipment_creation_error: errorMsg,
          shipment_creation_attempts: (order.shipment_creation_attempts || 0) + 1,
        })
        .eq("id", order_id);

      return NextResponse.json({ error: errorMsg }, { status: 502 });
    }
  } catch (err) {
    console.error("Create shipment error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
