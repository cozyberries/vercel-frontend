import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: null as unknown,
  cache: new Map<string, unknown>(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  fetchPaidOrders: vi.fn(),
  getSnapshot: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
  createAdminSupabaseClient: vi.fn(() => ({ tag: "admin-client" })),
}));
vi.mock("@/lib/upstash", () => ({ UpstashService: { get: h.redisGet, set: h.redisSet } }));
vi.mock("@/lib/catalog/cache", () => ({ getSnapshot: h.getSnapshot }));
vi.mock("@/lib/admin/sales-orders", () => ({ fetchPaidOrders: h.fetchPaidOrders }));

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { GET } from "./route";

const NOW = new Date("2026-10-02T04:30:00Z");
const PAID_TODAY = "2026-10-02T03:00:00Z";

const SNAPSHOT = {
  version: "v1",
  generatedAt: NOW.toISOString(),
  products: [
    {
      slug: "frill-petal",
      name: "Frill Sleeve Petal Pops",
      category_slug: "frill-sleeve-muslin",
      categories: { name: "Frill Sleeve Muslin", slug: "frill-sleeve-muslin" },
    },
  ],
  reference: { categories: [], genders: [], sizes: [], ages: [], colors: [] },
};

/** A row carrying the customer fields the orders table has, to prove none of them reaches the response. */
const ROW = {
  id: "9b1d3c1e-0000-4000-8000-000000000001",
  order_number: "CB-0042",
  user_id: "user-123",
  customer_name: "Priya Sharma",
  customer_email: "priya@example.com",
  customer_phone: "+919800000000",
  shipping_address: { address_line_1: "12 MG Road" },
  total_amount: 1200,
  fulfilment_method: "pickup",
  status: "collected",
  created_at: PAID_TODAY,
  stock_committed_at: PAID_TODAY,
  order_items: [{ product_id: "frill-petal", name: "Frill", price: 600, quantity: 2 }],
};

const req = (query = "?range=30d") => new NextRequest(`http://localhost/api/admin/dashboard/sales${query}`);

function keysDeep(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      keysDeep(v, out);
    }
  }
  return out;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  h.user = { id: "a", app_metadata: { role: "admin" } };
  h.cache.clear();
  h.redisGet.mockReset().mockImplementation(async (k: string) => h.cache.get(k) ?? null);
  h.redisSet.mockReset().mockImplementation(async (k: string, v: unknown) => {
    h.cache.set(k, v);
    return true;
  });
  h.fetchPaidOrders.mockReset().mockResolvedValue([ROW]);
  h.getSnapshot.mockReset().mockResolvedValue({ snapshot: SNAPSHOT, source: "redis" });
  vi.mocked(createAdminSupabaseClient).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/admin/dashboard/sales", () => {
  it("401s a guest before any service-role call", async () => {
    h.user = null;
    expect((await GET(req())).status).toBe(401);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
    expect(h.fetchPaidOrders).not.toHaveBeenCalled();
  });

  it("403s a customer", async () => {
    h.user = { id: "c", app_metadata: { role: "customer" } };
    expect((await GET(req())).status).toBe(403);
    expect(h.fetchPaidOrders).not.toHaveBeenCalled();
  });

  it.each(["", "?range=7d", "?range=ALL", "?range="])("400s a bad range (%s) without querying", async (query) => {
    const res = await GET(req(query));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "range must be one of 30d, 3m, 12m, all" });
    expect(h.fetchPaidOrders).not.toHaveBeenCalled();
  });

  it("computes from the start of the previous period, caches 5 minutes, and is never stored by the browser", async () => {
    const res = await GET(req("?range=30d"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await res.json();
    expect(body.cached).toBe(false);
    expect(body.metrics).toMatchObject({ range: "30d", kpis: { sales: { value: 1200 }, orders: { value: 1 } } });
    expect(h.fetchPaidOrders).toHaveBeenCalledWith({ tag: "admin-client" }, new Date("2026-08-03T18:30:00.000Z"));
    expect(h.redisSet).toHaveBeenCalledWith("admin:dashboard:sales:30d", body.metrics, 300);
  });

  it("reads every paid order for All time", async () => {
    await GET(req("?range=all"));
    expect(h.fetchPaidOrders).toHaveBeenCalledWith({ tag: "admin-client" }, null);
  });

  it("serves the cached copy on the next call", async () => {
    await GET(req("?range=3m"));
    const body = await (await GET(req("?range=3m"))).json();
    expect(body.cached).toBe(true);
    expect(h.fetchPaidOrders).toHaveBeenCalledTimes(1);
  });

  it("still answers when Redis is down (get → null, set → false)", async () => {
    h.redisGet.mockResolvedValue(null);
    h.redisSet.mockResolvedValue(false);
    expect((await GET(req())).status).toBe(200);
    expect((await GET(req())).status).toBe(200);
    expect(h.fetchPaidOrders).toHaveBeenCalledTimes(2);
  });

  it("500s with a generic message when the orders query fails, and caches nothing", async () => {
    h.fetchPaidOrders.mockRejectedValueOnce(new Error("permission denied for table orders"));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Couldn't load sales" });
    expect(h.redisSet).not.toHaveBeenCalled();
  });

  it("names products and categories from the catalog", async () => {
    const body = await (await GET(req())).json();
    expect(body.metrics.top_products[0]).toMatchObject({ name: "Frill Sleeve Petal Pops" });
    expect(body.metrics.categories[0]).toMatchObject({ name: "Frill Sleeve Muslin" });
  });

  it("still renders when the catalog is unavailable, with every category Uncategorised", async () => {
    h.getSnapshot.mockRejectedValueOnce(new Error("redis and supabase both down"));
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metrics.categories).toEqual([{ slug: null, name: "Uncategorised", value: 1200, units: 2 }]);
    expect(body.metrics.top_products[0].name).toBe("Frill");
  });

  it("returns aggregates only: no customer or order identifiers", async () => {
    const body = await (await GET(req("?range=all"))).json();
    expect(keysDeep(body).filter((k) => /email|phone|customer|address|order_number|user_id|^id$/.test(k))).toEqual([]);
    const text = JSON.stringify(body);
    for (const secret of [ROW.id, ROW.order_number, ROW.user_id, ROW.customer_name, ROW.customer_email, ROW.customer_phone, "12 MG Road"]) {
      expect(text).not.toContain(secret);
    }
  });
});
