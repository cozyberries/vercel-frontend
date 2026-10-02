import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { UpstashService } from "@/lib/upstash";
import { getSnapshot } from "@/lib/catalog/cache";
import { salesCacheKey, SALES_CACHE_TTL } from "@/lib/admin/dashboard-actions";
import { parseSalesRange, salesWindowStart } from "@/lib/admin/sales-range";
import {
  buildSalesMetrics,
  catalogLookupFromSnapshot,
  type CatalogLookup,
  type SalesMetrics,
} from "@/lib/admin/sales-metrics";
import { fetchPaidOrders } from "@/lib/admin/sales-orders";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** Product names and categories; null (everything "Uncategorised") if the catalog can't be read. */
async function loadCatalog(): Promise<CatalogLookup> {
  try {
    const { snapshot } = await getSnapshot();
    return catalogLookupFromSnapshot(snapshot);
  } catch (e) {
    console.error("[dashboard-sales] catalog unavailable:", e);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;

  const range = parseSalesRange(request.nextUrl.searchParams.get("range"));
  if (!range) {
    return NextResponse.json(
      { error: "range must be one of 30d, 3m, 12m, all" },
      { status: 400, headers: NO_STORE },
    );
  }

  const key = salesCacheKey(range);
  // UpstashService.get/set swallow Redis errors (null / false), so an outage just means computing each time.
  const cached = (await UpstashService.get(key)) as SalesMetrics | null;
  if (cached) return NextResponse.json({ metrics: cached, cached: true }, { headers: NO_STORE });

  try {
    const now = new Date();
    const orders = await fetchPaidOrders(createAdminSupabaseClient(), salesWindowStart(range, now));
    const metrics = buildSalesMetrics({ orders, catalog: await loadCatalog(), range, now });
    await UpstashService.set(key, metrics, SALES_CACHE_TTL);
    return NextResponse.json({ metrics, cached: false }, { headers: NO_STORE });
  } catch (e) {
    console.error("[dashboard-sales]", e);
    return NextResponse.json({ error: "Couldn't load sales" }, { status: 500, headers: NO_STORE });
  }
}
