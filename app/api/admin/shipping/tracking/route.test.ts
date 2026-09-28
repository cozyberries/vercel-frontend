import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => {
  const state = {
    cache: new Map<string, unknown>(),
    setCalls: [] as [string, unknown, unknown][],
    order: null as Row | null,
    orderUpdates: [] as Row[],
    tracking: {
      waybill: "WB1",
      currentStatus: "In Transit",
      scans: [
        { status: "Picked up", timestamp: "2026-09-27T10:00:00Z", location: "BLR" },
        { status: "In Transit", timestamp: "2026-09-28T10:00:00Z", location: "DEL" },
      ],
    },
    fetchError: null as Error | null,
  };
  return {
    state,
    reset: () => {
      state.cache.clear();
      state.setCalls = [];
      state.order = null;
      state.orderUpdates = [];
      state.fetchError = null;
    },
  };
});

vi.mock("@/lib/services/admin-gate", () => ({ requireAdmin: vi.fn(async () => ({ user: { id: "admin-1" } })) }));
vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: () => ({
      get: async (k: string) => h.state.cache.get(k) ?? null,
      set: async (k: string, v: unknown, opts: unknown) => { h.state.setCalls.push([k, v, opts]); },
    }),
  },
}));
vi.mock("@/lib/server/delhivery-package-tracking", () => ({
  fetchPackageTrackingByWaybill: vi.fn(async () => {
    if (h.state.fetchError) throw h.state.fetchError;
    return h.state.tracking;
  }),
}));
vi.mock("@/lib/supabase-server", () => ({
  createAdminSupabaseClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.state.order, error: null }) }) }),
      update: (patch: Row) => ({ eq: async () => { h.state.orderUpdates.push(patch); return { error: null }; } }),
    }),
  }),
}));

import { GET } from "./route";

const req = (qs: string) => new NextRequest(`http://localhost/api/admin/shipping/tracking${qs}`);

beforeEach(() => {
  h.reset();
  vi.clearAllMocks();
});

describe("GET /api/admin/shipping/tracking", () => {
  it("400 without a waybill", async () => {
    expect((await GET(req(""))).status).toBe(400);
  });

  it("cache miss: fetches, caches for 90s, returns cached:false", async () => {
    const res = await GET(req("?waybill=WB1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cached).toBe(false);
    expect(body.tracking.waybill).toBe("WB1");
    expect(h.state.setCalls[0][0]).toBe("delhivery:track:WB1");
    expect(h.state.setCalls[0][2]).toEqual({ ex: 90 });
  });

  it("cache hit returns cached:true without fetching", async () => {
    h.state.cache.set("delhivery:track:WB1", h.state.tracking);
    const { fetchPackageTrackingByWaybill } = await import("@/lib/server/delhivery-package-tracking");
    const body = await (await GET(req("?waybill=WB1"))).json();
    expect(body.cached).toBe(true);
    expect(fetchPackageTrackingByWaybill).not.toHaveBeenCalled();
  });

  it("502 when the upstream call fails", async () => {
    h.state.fetchError = new Error("delhivery down");
    expect((await GET(req("?waybill=WB1"))).status).toBe(502);
  });

  it("writes the latest-scan summary only for a matching shipped order", async () => {
    h.state.order = { id: "o-1", tracking_number: "WB1", carrier_name: "Delhivery", status: "shipped" };
    await GET(req("?waybill=WB1&order_id=o-1"));
    await new Promise((r) => setTimeout(r, 0)); // fire-and-forget settles
    expect(h.state.orderUpdates[0]).toMatchObject({
      delhivery_latest_status: "In Transit",
      delhivery_latest_scan_at: "2026-09-28T10:00:00Z", // newest scan, regardless of array order
      delhivery_latest_location: "DEL",
    });
  });

  it("skips the summary write when the order does not qualify", async () => {
    h.state.order = { id: "o-1", tracking_number: "OTHER", carrier_name: "Delhivery", status: "shipped" };
    await GET(req("?waybill=WB1&order_id=o-1"));
    await new Promise((r) => setTimeout(r, 0));
    expect(h.state.orderUpdates).toHaveLength(0);
  });
});
