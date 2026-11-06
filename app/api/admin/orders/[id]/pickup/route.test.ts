import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => {
  const DEFAULT_RESULT = {
    ok: true,
    data: { pickup_id: 118775, pickup_time: "14:00:00", pickup_date: "2026-11-06", pickup_location_name: "CB-WH", expected_package_count: 1 },
  } as Row;
  const state = {
    order: null as Row | null,
    updateError: null as { message: string } | null,
    updates: [] as Row[],
    pickupResult: DEFAULT_RESULT,
    pickupCalls: [] as Row[],
  };
  return {
    state,
    reset: () => {
      state.order = null;
      state.updateError = null;
      state.updates = [];
      state.pickupCalls = [];
      state.pickupResult = DEFAULT_RESULT;
    },
  };
});

vi.mock("@/lib/services/admin-gate", () => ({
  requireAdmin: vi.fn(async () => ({ user: { id: "admin-1" } })),
}));
vi.mock("@/lib/supabase-server", () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) => {
      if (table !== "orders") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.state.order, error: null }) }) }),
        update: (patch: Row) => ({
          eq: async () => {
            if (h.state.updateError) return { error: h.state.updateError };
            h.state.updates.push(patch);
            return { error: null };
          },
        }),
      };
    },
  }),
}));
vi.mock("@/lib/services/cache", () => ({
  default: { clearAllOrders: vi.fn(async () => true), clearOrderDetails: vi.fn(async () => true) },
}));
vi.mock("@/lib/delhivery/client", () => ({
  createPickupRequest: vi.fn(async (payload: Row) => {
    h.state.pickupCalls.push(payload);
    return h.state.pickupResult;
  }),
}));

import { POST } from "./route";
import { requireAdmin } from "@/lib/services/admin-gate";

const params = { params: Promise.resolve({ id: "o-1" }) };
const post = (body: Row = {}) =>
  POST(new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify(body) }), params);

const order = (o: Row = {}): Row => ({
  id: "o-1",
  user_id: "u-1",
  order_number: "ORD-1",
  fulfilment_method: "delivery",
  status: "processing",
  tracking_number: "WB123",
  carrier_name: "Delhivery",
  delivery_notes: null,
  ...o,
});

beforeEach(() => {
  h.reset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-06T06:30:00Z"));
  vi.stubEnv("DELIVERY_API_KEY", "tok");
  vi.stubEnv("DELHIVERY_WAREHOUSE_NAME", "CB-WH");
  h.state.order = order();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("POST .../pickup", () => {
  it("is refused without an admin session; Delhivery never called", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(requireAdmin).mockResolvedValueOnce({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as never);
    expect((await post()).status).toBe(401);
    expect(h.state.pickupCalls).toHaveLength(0);
  });

  it("400 when the order has no Delhivery shipment or is a pickup order", async () => {
    h.state.order = order({ tracking_number: null, carrier_name: null });
    expect((await post()).status).toBe(400);
    h.state.order = order({ fulfilment_method: "pickup" });
    expect((await post()).status).toBe(400);
    expect(h.state.pickupCalls).toHaveLength(0);
  });

  it("requests a same-day pickup of one parcel by default and notes the pickup on the order", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, pickup_id: 118775, date: "2026-11-06", time: "14:00:00", already_open: false });
    expect(h.state.pickupCalls[0]).toEqual({
      pickup_time: "14:00:00",
      pickup_date: "2026-11-06",
      pickup_location: "CB-WH",
      expected_package_count: 1,
    });
    expect(h.state.updates[0]).toMatchObject({ delivery_notes: "Pickup #118775 requested for 2026-11-06 14:00" });
  });

  it("takes a date and a count from the body and appends to existing notes", async () => {
    h.state.order = order({ delivery_notes: "Fragile" });
    h.state.pickupResult = { ok: true, data: { pickup_id: 5, pickup_time: "11:00:00", pickup_date: "2026-11-08", pickup_location_name: "CB-WH" } };
    const res = await post({ date: "2026-11-08", count: 3 });
    expect(res.status).toBe(200);
    expect(h.state.pickupCalls[0]).toMatchObject({ pickup_date: "2026-11-08", expected_package_count: 3 });
    expect(h.state.updates[0]).toMatchObject({ delivery_notes: "Fragile\nPickup #5 requested for 2026-11-08 11:00" });
  });

  it("400 for a past date or a bad count; Delhivery never called", async () => {
    expect((await post({ date: "2026-11-05" })).status).toBe(400);
    expect((await post({ count: 0 })).status).toBe(400);
    expect(h.state.pickupCalls).toHaveLength(0);
  });

  it("treats 'a request already exists' as done, without writing a note", async () => {
    h.state.pickupResult = { ok: false, statusCode: 400, error: '{"pr_exist": "Pickup request already exists for this date"}' };
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, already_open: true });
    expect(h.state.updates).toHaveLength(0);
  });

  it("passes any other Delhivery refusal through as 422 with its message", async () => {
    h.state.pickupResult = { ok: false, statusCode: 400, error: "Client wallet balance is 487.81 which is less than 500.0" };
    const res = await post();
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "Client wallet balance is 487.81 which is less than 500.0" });
    expect(h.state.updates).toHaveLength(0);
  });

  it("still reports the pickup when the note could not be written", async () => {
    h.state.updateError = { message: "db down" };
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, pickup_id: 118775, note_written: false });
  });
});
