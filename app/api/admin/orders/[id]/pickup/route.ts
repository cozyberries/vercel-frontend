// Raise a Delhivery pickup request for an order's parcel: the "Add to pickup" step after
// "Create Delhivery shipment". A pickup request is per warehouse and per day, not per parcel,
// so "a request already exists for that day" is reported as success (the executive collects
// every manifested parcel). The pickup id is noted on the order's delivery_notes.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import CacheService from "@/lib/services/cache";
import { createPickupRequest } from "@/lib/delhivery/client";
import { isDelhiveryOrder } from "@/lib/delhivery/utils";
import { appendPickupNote, interpretPickupResponse, pickupNoteLine, planPickup } from "@/lib/delhivery/pickup";

type Row = Record<string, unknown>;

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
    .select("id, user_id, order_number, fulfilment_method, tracking_number, carrier_name, delivery_notes")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  if (order.fulfilment_method === "pickup") {
    return NextResponse.json({ error: "Stall pickup orders are not collected by Delhivery" }, { status: 400 });
  }
  if (!isDelhiveryOrder(order.carrier_name as string | null, order.tracking_number as string | null)) {
    return NextResponse.json({ error: "Order has no Delhivery shipment yet; create the shipment first" }, { status: 400 });
  }

  const warehouseName = ((body.warehouse_name as string) || process.env.DELHIVERY_WAREHOUSE_NAME || "").trim();
  let payload;
  try {
    payload = planPickup({
      warehouseName,
      now: new Date(),
      date: typeof body.date === "string" && body.date ? body.date : undefined,
      count: body.count === undefined || body.count === null ? undefined : Number(body.count),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid pickup request" }, { status: 400 });
  }

  const result = await createPickupRequest(payload);
  const outcome = result.ok
    ? interpretPickupResponse(200, result.data)
    : interpretPickupResponse(result.statusCode ?? 0, result.error);

  if (!outcome.ok) {
    if (outcome.alreadyOpen) {
      return NextResponse.json({
        success: true,
        already_open: true,
        date: payload.pickup_date,
        location: payload.pickup_location,
        message: outcome.message,
      });
    }
    return NextResponse.json({ error: outcome.message }, { status: result.ok ? 422 : result.statusCode === 400 ? 422 : result.statusCode || 502 });
  }

  const line = pickupNoteLine(outcome);
  const { error: updateError } = await admin
    .from("orders")
    .update({
      delivery_notes: appendPickupNote(order.delivery_notes as string | null, line),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updateError) {
    console.error("[admin-pickup] note not written:", updateError.message);
  } else {
    Promise.all([
      CacheService.clearAllOrders(order.user_id as string),
      CacheService.clearOrderDetails(order.user_id as string, id),
    ]).catch((e) => console.error("[admin-pickup] cache clear failed:", e));
  }

  return NextResponse.json({
    success: true,
    already_open: false,
    pickup_id: outcome.pickupId,
    date: outcome.date,
    time: outcome.time,
    location: outcome.location,
    note_written: !updateError,
  });
}
