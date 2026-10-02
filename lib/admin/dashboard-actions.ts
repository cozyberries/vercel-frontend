import type { SupabaseClient } from "@supabase/supabase-js";
import { UpstashService } from "@/lib/upstash";
import { startOfIstDay } from "@/lib/orders/pickup";
import { SALES_RANGES, type SalesRange } from "@/lib/admin/sales-range";

export const DASHBOARD_ACTIONS_KEY = "admin:dashboard:actions";
export const DASHBOARD_ACTIONS_TTL = 60;
export const SALES_CACHE_TTL = 300;

/** Redis key for one range of the dashboard's sales section. */
export function salesCacheKey(range: SalesRange): string {
  return `admin:dashboard:sales:${range}`;
}

export interface DashboardActions {
  awaiting: number;
  to_ship: number;
  ready_for_pickup: number;
  collected_today: number;
  generated_at: string;
}

async function countRows(q: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Live counts for the dashboard tiles. Service-role client, read-only. */
export async function countDashboardActions(admin: SupabaseClient, now: Date): Promise<DashboardActions> {
  const head = { count: "exact" as const, head: true };
  const [awaiting, toShip, ready, collectedEvents] = await Promise.all([
    // Pickup only, so the count matches the Awaiting ✅ pickup tab the tile opens.
    // Delivery orders awaiting ✅ stay visible on /admin/orders.
    countRows(
      admin
        .from("orders")
        .select("id", head)
        .eq("fulfilment_method", "pickup")
        .in("status", ["payment_pending", "verifying_payment"]),
    ),
    countRows(
      admin
        .from("orders")
        .select("id", head)
        .eq("fulfilment_method", "delivery")
        .in("status", ["payment_confirmed", "processing"])
        .is("tracking_number", null),
    ),
    countRows(admin.from("orders").select("id", head).eq("fulfilment_method", "pickup").eq("status", "ready_for_pickup")),
    admin
      .from("order_status_events")
      .select("order_id")
      .eq("to_status", "collected")
      .gte("created_at", startOfIstDay(now).toISOString()),
  ]);
  if (collectedEvents.error) throw new Error(collectedEvents.error.message);
  const collectedToday = new Set((collectedEvents.data ?? []).map((r: { order_id: string }) => r.order_id)).size;
  return {
    awaiting,
    to_ship: toShip,
    ready_for_pickup: ready,
    collected_today: collectedToday,
    generated_at: now.toISOString(),
  };
}

/**
 * Called by every route that moves an order into or out of a paid status, or changes its status or
 * tracking number. One DEL clears the action counts and all four sales ranges. Never throws.
 */
export async function clearDashboardActions(): Promise<void> {
  try {
    await UpstashService.deleteMany([DASHBOARD_ACTIONS_KEY, ...SALES_RANGES.map(salesCacheKey)]);
  } catch (e) {
    console.error("[dashboard-actions] cache clear failed:", e);
  }
}
