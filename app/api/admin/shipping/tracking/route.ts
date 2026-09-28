// Live Delhivery tracking for the admin orders page. Reuses the customer
// route's fetchPackageTrackingByWaybill and caches 90s in Redis (the tracking
// panel polls every 90s — one upstream call per waybill per window).
import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { fetchPackageTrackingByWaybill } from "@/lib/server/delhivery-package-tracking";
import { isDelhiveryOrder } from "@/lib/delhivery/utils";
import type { OrderShipmentTrackingData } from "@/lib/types/delhivery-tracking";

const CACHE_TTL_SECONDS = 90;

function latestScan(tracking: OrderShipmentTrackingData) {
  return tracking.scans.reduce<OrderShipmentTrackingData["scans"][number] | null>((acc, s) => {
    if (!s.timestamp) return acc;
    if (!acc?.timestamp || s.timestamp > acc.timestamp) return s;
    return acc;
  }, null);
}

async function writeSummary(orderId: string, waybill: string, tracking: OrderShipmentTrackingData) {
  const admin = createAdminSupabaseClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, tracking_number, carrier_name, status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;
  if (order.tracking_number !== waybill) return;
  if (!isDelhiveryOrder(order.carrier_name as string | null, waybill)) return;
  if (order.status !== "shipped" && order.status !== "delivered") return;
  if (!tracking.currentStatus) return;

  const scan = latestScan(tracking);
  await admin
    .from("orders")
    .update({
      delhivery_latest_status: tracking.currentStatus,
      delhivery_latest_scan_at: scan?.timestamp ?? null,
      delhivery_latest_location: scan?.location ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;

  const waybill = request.nextUrl.searchParams.get("waybill")?.trim();
  const orderId = request.nextUrl.searchParams.get("order_id")?.trim();
  if (!waybill) {
    return NextResponse.json({ error: "waybill is required" }, { status: 400 });
  }

  const cacheKey = `delhivery:track:${waybill}`;
  let redis: Redis | null = null;
  try {
    redis = Redis.fromEnv();
    const cached = await redis.get<OrderShipmentTrackingData>(cacheKey);
    if (cached) {
      return NextResponse.json({ tracking: cached, cached: true });
    }
  } catch (e) {
    console.error("[admin-tracking] cache read failed:", e); // fall through to live call
  }

  let tracking: OrderShipmentTrackingData;
  try {
    tracking = await fetchPackageTrackingByWaybill(waybill);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Tracking fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  try {
    await redis?.set(cacheKey, tracking, { ex: CACHE_TTL_SECONDS });
  } catch (e) {
    console.error("[admin-tracking] cache write failed:", e);
  }

  if (orderId) {
    writeSummary(orderId, waybill, tracking).catch((e) =>
      console.error("[admin-tracking] summary write failed:", e)
    );
  }

  return NextResponse.json({ tracking, cached: false });
}
