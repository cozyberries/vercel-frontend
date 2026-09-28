import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => {
  const state = {
    user: { id: "admin-1", app_metadata: { role: "admin" } } as Row | null,
    order: { id: "o-1", user_id: "u-1", status: "payment_confirmed" } as Row | null,
    updatedRow: null as Row | null,
    updateError: null as { code?: string; message: string } | null,
    updates: [] as Row[],
    updateEqs: [] as [string, unknown][],
    audits: [] as Row[],
    cacheCalls: [] as string[],
  };
  const admin = {
    from: vi.fn((table: string) => {
      if (table === "orders")
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: state.order, error: null }) }),
          }),
          update: vi.fn((patch: Row) => {
            state.updates.push(patch);
            const q: Row = {};
            (q.eq as unknown) = vi.fn((col: string, v: unknown) => {
              state.updateEqs.push([col, v]);
              return q;
            });
            (q.select as unknown) = vi.fn(() => ({
              maybeSingle: async () =>
                state.updateError
                  ? { data: null, error: state.updateError }
                  : { data: state.updatedRow, error: null },
            }));
            return q;
          }),
        };
      if (table === "order_status_events")
        return { insert: vi.fn(async (row: Row) => { state.audits.push(row); return { error: null }; }) };
      if (table === "order_items" || table === "payments")
        return {
          select: () => ({
            eq: () =>
              table === "payments"
                ? { order: async () => ({ data: [], error: null }) }
                : Promise.resolve({ data: [], error: null }),
          }),
        };
      throw new Error(`unexpected table ${table}`);
    }),
  };
  return {
    state,
    admin,
    reset: () => {
      state.user = { id: "admin-1", app_metadata: { role: "admin" } };
      state.order = { id: "o-1", user_id: "u-1", status: "payment_confirmed" };
      state.updatedRow = { id: "o-1", user_id: "u-1", status: "processing" };
      state.updateError = null;
      state.updates = [];
      state.updateEqs = [];
      state.audits = [];
      state.cacheCalls = [];
    },
  };
});

vi.mock("@/lib/services/admin-gate", () => ({
  requireAdmin: vi.fn(async () => {
    if (!h.state.user) {
      const { NextResponse } = await import("next/server");
      return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    return { user: h.state.user };
  }),
}));
vi.mock("@/lib/supabase-server", () => ({ createAdminSupabaseClient: () => h.admin }));
vi.mock("@/lib/invoice/bill-link", () => ({ billUrl: () => "https://cozyberries.in/bill/o-1/sig" }));
vi.mock("@/lib/services/cache", () => ({
  default: {
    clearAllOrders: vi.fn(async (uid: string) => { h.state.cacheCalls.push(`all:${uid}`); return true; }),
    clearOrderDetails: vi.fn(async (uid: string, oid: string) => { h.state.cacheCalls.push(`one:${uid}:${oid}`); return true; }),
  },
}));

import { GET, PATCH } from "./route";

const params = { params: Promise.resolve({ id: "o-1" }) };
const patchReq = (body: Row) =>
  new NextRequest("http://localhost/api/admin/orders/o-1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

beforeEach(() => h.reset());

describe("GET /api/admin/orders/[id]", () => {
  it("404 when the order is missing", async () => {
    h.state.order = null;
    expect((await GET(new NextRequest("http://localhost/x"), params)).status).toBe(404);
  });
  it("returns the order with items and payments", async () => {
    const res = await GET(new NextRequest("http://localhost/x"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).order).toMatchObject({ id: "o-1", items: [], payments: [] });
  });
});

describe("PATCH /api/admin/orders/[id]", () => {
  it("400 on an unknown status and on an empty body", async () => {
    expect((await PATCH(patchReq({ status: "bogus" }), params)).status).toBe(400);
    expect((await PATCH(patchReq({}), params)).status).toBe(400);
    expect(h.state.updates).toHaveLength(0);
  });

  it("accepts verifying_payment (the admin app's whitelist forgot it)", async () => {
    h.state.updatedRow = { id: "o-1", user_id: "u-1", status: "verifying_payment" };
    expect((await PATCH(patchReq({ status: "verifying_payment" }), params)).status).toBe(200);
  });

  it("status change: optimistic eq, audit row, cache cleared", async () => {
    const res = await PATCH(patchReq({ status: "processing" }), params);
    expect(res.status).toBe(200);
    expect(h.state.updateEqs).toEqual(
      expect.arrayContaining([["id", "o-1"], ["status", "payment_confirmed"]])
    );
    expect(h.state.audits[0]).toMatchObject({
      order_id: "o-1",
      from_status: "payment_confirmed",
      to_status: "processing",
      actor_admin_id: "admin-1",
    });
    expect(h.state.cacheCalls).toEqual(expect.arrayContaining(["all:u-1", "one:u-1:o-1"]));
  });

  it("409 when the status changed under us; no audit row, no cache clear", async () => {
    h.state.updatedRow = null; // maybeSingle -> no row matched the optimistic eq
    const res = await PATCH(patchReq({ status: "processing" }), params);
    expect(res.status).toBe(409);
    expect(h.state.audits).toHaveLength(0);
    expect(h.state.cacheCalls).toHaveLength(0);
  });

  it("409 with the message on a CHECK violation (pickup-only status on delivery order)", async () => {
    h.state.updateError = { code: "23514", message: 'violates check constraint "orders_pickup_status_check"' };
    const res = await PATCH(patchReq({ status: "ready_for_pickup" }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("check constraint");
  });

  it("tracking-only update skips the optimistic status eq and the audit row", async () => {
    h.state.updatedRow = { id: "o-1", user_id: "u-1", status: "payment_confirmed", tracking_number: "AWB9" };
    const res = await PATCH(patchReq({ tracking_number: "AWB9", carrier_name: "Delhivery" }), params);
    expect(res.status).toBe(200);
    expect(h.state.updateEqs.find(([c]) => c === "status")).toBeUndefined();
    expect(h.state.audits).toHaveLength(0);
  });
});
