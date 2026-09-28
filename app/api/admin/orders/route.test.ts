import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => {
  const state = {
    user: { id: "admin-1", app_metadata: { role: "admin" } } as Row | null,
    orders: [] as Row[],
    total: 0,
    filters: [] as [string, unknown][],
    itemsError: null as { message: string } | null,
    paymentsError: null as { message: string } | null,
  };
  function listQuery() {
    const q: Record<string, unknown> = {};
    const chain = (ret: unknown) => vi.fn(() => ret);
    q.eq = vi.fn((col: string, v: unknown) => { state.filters.push([col, v]); return q; });
    q.gte = vi.fn((col: string, v: unknown) => { state.filters.push([col, v]); return q; });
    q.lte = vi.fn((col: string, v: unknown) => { state.filters.push([col, v]); return q; });
    q.order = chain(q);
    q.range = vi.fn(async () => ({ data: state.orders, error: null }));
    return q;
  }
  // The head-count query needs to stay a thenable through an arbitrary chain of
  // .eq()/.gte()/.lte() calls (applyFilters may call any subset of them). Building
  // it as its own object — filter methods return `c` itself, and `c.then` resolves
  // the count — avoids the earlier bug where merging onto a real Promise via
  // Object.assign broke as soon as a filter method's return value replaced it.
  function countQuery() {
    const c: Record<string, unknown> = {};
    c.eq = vi.fn((col: string, v: unknown) => { state.filters.push([col, v]); return c; });
    c.gte = vi.fn((col: string, v: unknown) => { state.filters.push([col, v]); return c; });
    c.lte = vi.fn((col: string, v: unknown) => { state.filters.push([col, v]); return c; });
    c.then = (resolve: (v: unknown) => void) => resolve({ count: state.total, error: null });
    return c;
  }
  const admin = {
    from: vi.fn((table: string) => {
      if (table === "orders")
        return {
          select: vi.fn((_c: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.head) return countQuery();
            return listQuery();
          }),
        };
      if (table === "order_items" || table === "payments")
        return {
          select: () => ({
            in: () =>
              table === "payments"
                ? {
                    order: async () => ({
                      data: state.paymentsError ? null : [],
                      error: state.paymentsError,
                    }),
                  }
                : Promise.resolve({ data: state.itemsError ? null : [], error: state.itemsError }),
          }),
        };
      throw new Error(`unexpected table ${table}`);
    }),
  };
  return {
    state,
    admin,
    reset: () => {
      state.orders = [];
      state.total = 0;
      state.filters = [];
      state.user = { id: "admin-1", app_metadata: { role: "admin" } };
      state.itemsError = null;
      state.paymentsError = null;
    },
  };
});

vi.mock("@/lib/services/admin-gate", () => ({
  requireAdmin: vi.fn(async () => {
    if (!h.state.user) {
      const { NextResponse } = await import("next/server");
      return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    return { user: h.state.user };
  }),
}));
vi.mock("@/lib/supabase-server", () => ({ createAdminSupabaseClient: () => h.admin }));
vi.mock("@/lib/invoice/bill-link", () => ({ billUrl: (id: string) => `https://cozyberries.in/bill/${id}/sig` }));

import { GET } from "./route";

const req = (qs = "") => new NextRequest(`http://localhost/api/admin/orders${qs}`);

beforeEach(() => h.reset());

describe("GET /api/admin/orders", () => {
  it("401/403 comes straight from the gate", async () => {
    h.state.user = null;
    expect((await GET(req())).status).toBe(401);
  });

  it("returns orders with items, payments and bill_url", async () => {
    h.state.orders = [{ id: "o-1", user_id: "u-1", status: "processing" }];
    h.state.total = 1;
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.orders[0]).toMatchObject({ id: "o-1", items: [], payments: [], bill_url: expect.stringContaining("/bill/o-1/") });
  });

  it("applies status, fulfilment and date filters; ignores status=all", async () => {
    h.state.total = 7;
    const res = await GET(req("?status=shipped&fulfilment=pickup&from_date=2026-09-01&to_date=2026-09-28"));
    const body = await res.json();
    expect(body.total).toBe(7);
    expect(h.state.filters).toEqual(
      expect.arrayContaining([
        ["status", "shipped"],
        ["fulfilment_method", "pickup"],
        ["created_at", "2026-09-01"],
        ["created_at", "2026-09-28T23:59:59.999Z"],
      ])
    );
    h.state.filters = [];
    await GET(req("?status=all"));
    expect(h.state.filters.find(([c]) => c === "status")).toBeUndefined();
  });

  it("500s when the items batch fetch errors", async () => {
    h.state.orders = [{ id: "o-1", user_id: "u-1", status: "processing" }];
    h.state.total = 1;
    h.state.itemsError = { message: "items table unavailable" };
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("items table unavailable");
  });

  it("500s when the payments batch fetch errors", async () => {
    h.state.orders = [{ id: "o-1", user_id: "u-1", status: "processing" }];
    h.state.total = 1;
    h.state.paymentsError = { message: "payments table unavailable" };
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("payments table unavailable");
  });
});
