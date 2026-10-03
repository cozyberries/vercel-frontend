import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: null as unknown,
  fetchActiveVariants: vi.fn(),
  fetchPaidOrders: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
  createAdminSupabaseClient: vi.fn(() => ({ tag: "admin-client" })),
}));
vi.mock("@/lib/admin/stock-variants", () => ({ fetchActiveVariants: h.fetchActiveVariants }));
vi.mock("@/lib/admin/sales-orders", () => ({ fetchPaidOrders: h.fetchPaidOrders }));

import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { GET } from "./route";

const NOW = new Date("2026-10-03T04:30:00Z");

const VARIANT = {
  slug: "frill-0-3m",
  product_slug: "frill",
  size_slug: "0-3m",
  stock_quantity: 1,
  price: 600,
  products: {
    name: "Frill Sleeve Petal Pops",
    is_active: true,
    category_slug: "frill-sleeve-muslin",
    categories: { name: "Frill Sleeve Muslin" },
  },
  sizes: { name: "0-3M", display_order: 1 },
};

/** A paid order carrying the customer fields the orders table has, to prove none reaches the response. */
const ORDER = {
  id: "9b1d3c1e-0000-4000-8000-000000000001",
  order_number: "CB-0042",
  user_id: "user-123",
  customer_name: "Priya Sharma",
  customer_email: "priya@example.com",
  customer_phone: "+919800000000",
  shipping_address: { address_line_1: "12 MG Road" },
  total_amount: 600,
  fulfilment_method: "pickup",
  status: "collected",
  created_at: "2026-10-02T05:00:00Z",
  stock_committed_at: "2026-10-02T05:00:00Z",
  order_items: [{ product_id: "frill", name: "Frill", price: 600, quantity: 1, sku: "frill-0-3m", size: "0-3M" }],
};

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
  h.fetchActiveVariants.mockReset().mockResolvedValue([VARIANT]);
  h.fetchPaidOrders.mockReset().mockResolvedValue([ORDER]);
  vi.mocked(createAdminSupabaseClient).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/admin/stock", () => {
  it("401s a guest before any service-role call", async () => {
    h.user = null;
    expect((await GET()).status).toBe(401);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
    expect(h.fetchActiveVariants).not.toHaveBeenCalled();
  });

  it("403s a customer", async () => {
    h.user = { id: "c", app_metadata: { role: "customer" } };
    expect((await GET()).status).toBe(403);
    expect(h.fetchActiveVariants).not.toHaveBeenCalled();
  });

  it("reads variants and every paid order live, and is never stored by the browser", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await res.json();
    expect(body.metrics.kpis).toEqual({ units: 1, value: 600, sizes: 1, in: 0, low: 1, out: 0 });
    expect(body.metrics.restock[0]).toMatchObject({ variant_slug: "frill-0-3m", sold_30d: 1, sold_all: 1 });
    expect(h.fetchActiveVariants).toHaveBeenCalledWith({ tag: "admin-client" });
    expect(h.fetchPaidOrders).toHaveBeenCalledWith({ tag: "admin-client" }, null);
  });

  it.each([
    ["variants", () => h.fetchActiveVariants.mockRejectedValueOnce(new Error("variants down"))],
    ["orders", () => h.fetchPaidOrders.mockRejectedValueOnce(new Error("orders down"))],
  ])("500s with a generic message when the %s query fails", async (_name, arrange) => {
    arrange();
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Couldn't load stock" });
  });

  it("returns product and size data only: no customer or order identifiers", async () => {
    const body = await (await GET()).json();
    expect(keysDeep(body).filter((k) => /email|phone|customer|address|order_number|user_id|^id$/.test(k))).toEqual([]);
    const text = JSON.stringify(body);
    for (const secret of [ORDER.id, ORDER.order_number, ORDER.user_id, ORDER.customer_name, ORDER.customer_email, ORDER.customer_phone, "12 MG Road"]) {
      expect(text).not.toContain(secret);
    }
  });
});
