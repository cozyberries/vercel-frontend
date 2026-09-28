// Create/cancel a Delhivery shipment for an order. Cancelling a shipment does
// NOT cancel the order (the admin app conflated the two); it clears the
// tracking fields so a replacement shipment can be created.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import CacheService from "@/lib/services/cache";
import { createShipment, cancelShipment } from "@/lib/delhivery/client";
import { isDelhiveryOrder } from "@/lib/delhivery/utils";
import type { CreateShipmentRequest } from "@/lib/delhivery/types";

type Row = Record<string, unknown>;

const ORDER_COLUMNS =
  "id, user_id, order_number, fulfilment_method, tracking_number, carrier_name, status, total_amount, customer_phone, shipping_address, payments(payment_method, status)";

function clearCaches(userId: string, orderId: string) {
  Promise.all([
    CacheService.clearAllOrders(userId),
    CacheService.clearOrderDetails(userId, orderId),
  ]).catch((e) => console.error("[admin-shipment] cache clear failed:", e));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;

  let body: Row = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text) as Row;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data: order, error } = await admin
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  if (order.fulfilment_method === "pickup") {
    return NextResponse.json({ error: "Pickup orders have no shipments" }, { status: 409 });
  }
  if (order.tracking_number && (order.carrier_name as string | null) === "Delhivery") {
    return NextResponse.json(
      { error: "Order already has a Delhivery shipment", waybill: order.tracking_number },
      { status: 409 }
    );
  }
  const addr = order.shipping_address as Row | null;
  if (!addr) {
    return NextResponse.json({ error: "Order has no shipping address" }, { status: 400 });
  }
  const warehouseName =
    ((body.warehouse_name as string) || process.env.DELHIVERY_WAREHOUSE_NAME || "").trim();
  if (!warehouseName) {
    return NextResponse.json(
      { error: "No warehouse name (body.warehouse_name or DELHIVERY_WAREHOUSE_NAME)" },
      { status: 400 }
    );
  }

  const { data: items } = await admin.from("order_items").select("*").eq("order_id", id);
  const lines = (items ?? []) as Row[];
  const productsDesc = lines
    .map((it) => `${(it.sku as string) || "item"}(${(it.quantity as number) ?? 1})`)
    .join("~");
  const totalQty = lines.reduce((sum, it) => sum + ((it.quantity as number) ?? 1), 0);

  const payments = (order.payments ?? []) as Row[];
  const isCod = payments.some((p) => p.payment_method === "cod" && p.status === "completed");
  const totalAmount = (order.total_amount as number) ?? 0;

  const payload: CreateShipmentRequest = {
    shipments: [
      {
        name: (addr.full_name as string) || "Customer",
        order: (order.order_number as string) || id,
        phone: (addr.phone as string) || (order.customer_phone as string) || "",
        add: [addr.address_line_1, addr.address_line_2].filter(Boolean).join(", "),
        pin: parseInt((addr.postal_code as string) || "0", 10),
        city: (addr.city as string) || "",
        state: (addr.state as string) || "",
        country: (addr.country as string) || "India",
        payment_mode: isCod ? "COD" : "Prepaid",
        cod_amount: isCod ? totalAmount : 0,
        total_amount: totalAmount,
        weight: (body.weight as number) || 500,
        products_desc: productsDesc,
        quantity: String(totalQty || 1),
        shipping_mode: (body.shipping_mode as "Surface" | "Express" | undefined) || "Surface",
        seller_name: warehouseName || "Cozyberries",
        seller_add: (body.seller_add as string) || "",
        return_name: warehouseName || "Cozyberries",
        waybill: "",
      },
    ],
    pickup_location: { name: warehouseName },
  };

  const result = await createShipment(payload);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.statusCode || 502 });
  }
  const data = result.data;
  if (!data.success) {
    return NextResponse.json({ error: data.rmk || "Delhivery rejected the shipment" }, { status: 422 });
  }
  const pkg = data.packages?.[0];
  if (!pkg || pkg.status !== "Success") {
    return NextResponse.json(
      { error: (pkg?.remarks || []).join("; ") || "Delhivery returned no package" },
      { status: 422 }
    );
  }

  const { error: updateError } = await admin
    .from("orders")
    .update({
      tracking_number: pkg.waybill,
      carrier_name: "Delhivery",
      status: "processing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updateError) {
    console.error("[admin-shipment] tracking write failed:", updateError.message);
  }
  clearCaches(order.user_id as string, id);

  return NextResponse.json({
    success: true,
    waybill: pkg.waybill,
    package_count: data.package_count,
    upload_wbn: data.upload_wbn,
  });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;

  const admin = createAdminSupabaseClient();
  const { data: order, error } = await admin
    .from("orders")
    .select("id, user_id, tracking_number, carrier_name")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const waybill = order.tracking_number as string | null;
  if (!isDelhiveryOrder(order.carrier_name as string | null, waybill)) {
    return NextResponse.json({ error: "Order has no Delhivery shipment" }, { status: 400 });
  }

  const result = await cancelShipment(waybill as string);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.statusCode || 502 });
  }
  if (!result.data.status) {
    return NextResponse.json(
      { error: result.data.error || result.data.remark || "Delhivery refused the cancellation" },
      { status: 422 }
    );
  }

  const remark = result.data.remark;
  const { error: updateError } = await admin
    .from("orders")
    .update({
      tracking_number: null,
      carrier_name: null,
      delhivery_latest_status: null,
      delhivery_latest_scan_at: null,
      delhivery_latest_location: null,
      delivery_notes: remark ? `Shipment ${waybill} cancelled: ${remark}` : `Shipment ${waybill} cancelled`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updateError) {
    return NextResponse.json(
      {
        success: false,
        delhivery_success: true,
        db_update_success: false,
        error: updateError.message,
        waybill,
      },
      { status: 503 }
    );
  }
  clearCaches(order.user_id as string, id);

  return NextResponse.json({
    success: true,
    delhivery_success: true,
    db_update_success: true,
    waybill,
    remark,
  });
}
