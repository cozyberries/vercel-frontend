import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => {
  const DEFAULT_CREATE_RESULT = { ok: true, data: { success: true, package_count: 1, upload_wbn: "UPL1", packages: [{ status: "Success", waybill: "WB123", remarks: [] }] } } as Row;
  const DEFAULT_CANCEL_RESULT = { ok: true, data: { status: true, waybill: "WB123", remark: "Cancelled", order_id: "ORD-1" } } as Row;
  const state = {
    order: null as Row | null,
    items: [] as Row[],
    itemsError: null as { message: string } | null,
    updateError: null as { message: string } | null,
    updates: [] as Row[],
    createResult: DEFAULT_CREATE_RESULT,
    cancelResult: DEFAULT_CANCEL_RESULT,
    createCalls: [] as Row[],
    cancelCalls: [] as string[],
  };
  return {
    state,
    reset: () => {
      state.order = null;
      state.items = [];
      state.itemsError = null;
      state.updateError = null;
      state.updates = [];
      state.createCalls = [];
      state.cancelCalls = [];
      // Each test file run shares this hoisted state across all tests (module-level,
      // not per-test), so any test that mutates createResult/cancelResult must have
      // its default restored here or the mutation leaks into later tests.
      state.createResult = DEFAULT_CREATE_RESULT;
      state.cancelResult = DEFAULT_CANCEL_RESULT;
    },
  };
});

vi.mock("@/lib/services/admin-gate", () => ({
  requireAdmin: vi.fn(async () => ({ user: { id: "admin-1" } })),
}));
vi.mock("@/lib/supabase-server", () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "orders")
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
      if (table === "order_items")
        return { select: () => ({ eq: async () => ({ data: h.state.items, error: h.state.itemsError }) }) };
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));
vi.mock("@/lib/services/cache", () => ({
  default: { clearAllOrders: vi.fn(async () => true), clearOrderDetails: vi.fn(async () => true) },
}));
vi.mock("@/lib/delhivery/client", () => ({
  createShipment: vi.fn(async (payload: Row) => { h.state.createCalls.push(payload); return h.state.createResult; }),
  cancelShipment: vi.fn(async (wb: string) => { h.state.cancelCalls.push(wb); return h.state.cancelResult; }),
}));
vi.mock("@/lib/admin/dashboard-actions", () => ({ clearDashboardActions: vi.fn(async () => {}) }));

import { POST, DELETE } from "./route";
import CacheService from "@/lib/services/cache";
import { clearDashboardActions } from "@/lib/admin/dashboard-actions";

const params = { params: Promise.resolve({ id: "o-1" }) };
const post = (body: Row = {}) =>
  POST(new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify(body) }), params);
const del = () => DELETE(new NextRequest("http://localhost/x", { method: "DELETE" }), params);

const deliveryOrder = (over: Row = {}): Row => ({
  id: "o-1",
  user_id: "u-1",
  order_number: "ORD-1",
  fulfilment_method: "delivery",
  tracking_number: null,
  carrier_name: null,
  status: "payment_confirmed",
  total_amount: 999,
  customer_phone: "9999999999",
  shipping_address: {
    full_name: "Asha", phone: "8888888888", address_line_1: "12 MG Road",
    address_line_2: "", city: "Bengaluru", state: "Karnataka", postal_code: "560001", country: "India",
  },
  payments: [],
  ...over,
});

beforeEach(() => {
  h.reset();
  vi.stubEnv("DELIVERY_API_KEY", "tok");
  vi.stubEnv("DELHIVERY_WAREHOUSE_NAME", "CB-WH");
  h.state.order = deliveryOrder();
  h.state.items = [{ order_id: "o-1", sku: "frock-red-2-3y", quantity: 2, size: "2-3Y" }];
});
afterEach(() => vi.unstubAllEnvs());

describe("POST .../shipment", () => {
  it("409 for pickup orders; Delhivery never called", async () => {
    h.state.order = deliveryOrder({ fulfilment_method: "pickup" });
    expect((await post()).status).toBe(409);
    expect(h.state.createCalls).toHaveLength(0);
  });

  it("409 when a Delhivery waybill already exists, with the waybill in the body", async () => {
    h.state.order = deliveryOrder({ tracking_number: "WB-OLD", carrier_name: "Delhivery" });
    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).waybill).toBe("WB-OLD");
    expect(h.state.createCalls).toHaveLength(0);
  });

  it("409 for a carrier name that merely contains Delhivery (e.g. 'Delhivery Surface')", async () => {
    h.state.order = deliveryOrder({ tracking_number: "WB-OLD", carrier_name: "Delhivery Surface" });
    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).waybill).toBe("WB-OLD");
    expect(h.state.createCalls).toHaveLength(0);
  });

  it("409 for a payment_pending order; Delhivery never called", async () => {
    h.state.order = deliveryOrder({ status: "payment_pending" });
    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("payment_pending");
    expect(h.state.createCalls).toHaveLength(0);
  });

  it("allows creation for a processing order (retry after a split-state failure)", async () => {
    h.state.order = deliveryOrder({ status: "processing" });
    const res = await post();
    expect(res.status).toBe(200);
    expect(h.state.createCalls).toHaveLength(1);
  });

  it("400 without a shipping address or warehouse name", async () => {
    h.state.order = deliveryOrder({ shipping_address: null });
    expect((await post()).status).toBe(400);
    h.state.order = deliveryOrder();
    vi.stubEnv("DELHIVERY_WAREHOUSE_NAME", "");
    expect((await post()).status).toBe(400);
  });

  it("creates the shipment and writes tracking + processing", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, waybill: "WB123" });
    const sent = h.state.createCalls[0] as { shipments: Row[]; pickup_location: Row };
    expect(sent.pickup_location).toEqual({ name: "CB-WH" });
    expect(sent.shipments[0]).toMatchObject({
      name: "Asha", order: "ORD-1", pin: 560001, payment_mode: "Prepaid", weight: 500,
    });
    expect(h.state.updates[0]).toMatchObject({
      tracking_number: "WB123", carrier_name: "Delhivery", status: "processing",
    });
    expect(clearDashboardActions).toHaveBeenCalled();
  });

  it("422 when Delhivery rejects; no DB write", async () => {
    h.state.createResult = { ok: true, data: { success: false, rmk: "Bad pin", packages: [] } };
    expect((await post()).status).toBe(422);
    expect(h.state.updates).toHaveLength(0);
  });

  it("500 when the order_items fetch errors; Delhivery never called", async () => {
    h.state.itemsError = { message: "db timeout" };
    expect((await post()).status).toBe(500);
    expect(h.state.createCalls).toHaveLength(0);
  });

  it("503 split-state when Delhivery creates but the DB write failed", async () => {
    h.state.updateError = { message: "db down" };
    const clearAllOrdersCallsBefore = vi.mocked(CacheService.clearAllOrders).mock.calls.length;
    const clearOrderDetailsCallsBefore = vi.mocked(CacheService.clearOrderDetails).mock.calls.length;
    const res = await post();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      success: false, delhivery_success: true, db_update_success: false, waybill: "WB123",
    });
    // Caches must not be cleared when the DB write itself failed — nothing changed.
    expect(vi.mocked(CacheService.clearAllOrders).mock.calls.length).toBe(clearAllOrdersCallsBefore);
    expect(vi.mocked(CacheService.clearOrderDetails).mock.calls.length).toBe(clearOrderDetailsCallsBefore);
  });
});

describe("DELETE .../shipment", () => {
  beforeEach(() => {
    h.state.order = deliveryOrder({ tracking_number: "WB123", carrier_name: "Delhivery", status: "processing" });
  });

  it("400 when there is no Delhivery shipment", async () => {
    h.state.order = deliveryOrder();
    expect((await del()).status).toBe(400);
    expect(h.state.cancelCalls).toHaveLength(0);
  });

  it("cancels and clears tracking without touching status", async () => {
    const res = await del();
    expect(res.status).toBe(200);
    expect(h.state.cancelCalls).toEqual(["WB123"]);
    const patch = h.state.updates[0];
    expect(patch).toMatchObject({ tracking_number: null, carrier_name: null, delhivery_latest_status: null });
    expect(patch.delivery_notes).toContain("WB123");
    expect("status" in patch).toBe(false);
    expect(clearDashboardActions).toHaveBeenCalled();
  });

  it("appends the cancellation note instead of clobbering existing delivery_notes", async () => {
    h.state.order = deliveryOrder({
      tracking_number: "WB123",
      carrier_name: "Delhivery",
      status: "processing",
      delivery_notes: "Fragile — handle with care",
    });
    const res = await del();
    expect(res.status).toBe(200);
    const patch = h.state.updates[0];
    expect(patch.delivery_notes).toBe("Fragile — handle with care\nShipment WB123 cancelled: Cancelled");
  });

  it("422 when Delhivery refuses; no DB write", async () => {
    h.state.cancelResult = { ok: true, data: { status: false, remark: "Already dispatched" } };
    expect((await del()).status).toBe(422);
    expect(h.state.updates).toHaveLength(0);
  });

  it("503 split-state when Delhivery cancelled but the DB write failed", async () => {
    h.state.updateError = { message: "db down" };
    const res = await del();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      success: false, delhivery_success: true, db_update_success: false, waybill: "WB123",
    });
  });
});
