import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { fetchActiveVariants } from "@/lib/admin/stock-variants";
import { fetchPaidOrders } from "@/lib/admin/sales-orders";
import { buildStockMetrics } from "@/lib/admin/stock-metrics";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** Live stock for /admin/stock. No cache: two small reads per load on an admin-only page. */
export async function GET() {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;

  try {
    const admin = createAdminSupabaseClient();
    const [variants, orders] = await Promise.all([fetchActiveVariants(admin), fetchPaidOrders(admin, null)]);
    const metrics = buildStockMetrics({ variants, orders, now: new Date() });
    return NextResponse.json({ metrics }, { headers: NO_STORE });
  } catch (e) {
    console.error("[admin-stock]", e);
    return NextResponse.json({ error: "Couldn't load stock" }, { status: 500, headers: NO_STORE });
  }
}
