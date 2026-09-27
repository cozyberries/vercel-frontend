import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state: Record<string, any> = {};
  const rpc = vi.fn();
  const getSnapshot = vi.fn();
  const reset = () => {
    state.user = {
      id: "admin-1",
      email: "asha@cozyberries.in",
      app_metadata: { role: "admin" },
      user_metadata: { full_name: "Asha" },
    };
    rpc.mockReset();
    getSnapshot.mockReset();
  };
  return { state, rpc, getSnapshot, reset };
});

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.state.user }, error: null }) },
  })),
  createAdminSupabaseClient: vi.fn(() => ({ rpc: h.rpc })),
}));
vi.mock("@/lib/catalog/cache", () => ({ getSnapshot: h.getSnapshot }));

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { GET, POST } from "./route";

const PHOTO =
  "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/public/media/products/frock-moon/1.jpg";
const dbRow = (over: Record<string, unknown> = {}) => ({
  sale_date: "2026-09-27",
  variant_slug: "frock-moon-0-3m",
  product_slug: "frock-moon",
  item_name: "Moon frock (as billed)",
  item_size: "0-3M",
  sold: 3,
  stock_now: 1,
  handled: 0,
  actions: [],
  ...over,
});
const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/admin/stall-refills", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
const tick = { sale_date: "2026-09-27", variant_slug: "frock-moon-0-3m", action: "refilled", quantity: 3 };

beforeEach(() => {
  h.reset();
  vi.mocked(createAdminSupabaseClient).mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-27T06:00:00Z")); // 11:30 IST
  h.getSnapshot.mockResolvedValue({
    snapshot: { products: [{ slug: "frock-moon", name: "Moon and Stars Frock", images: [PHOTO] }] },
    source: "redis",
  });
});
afterEach(() => vi.useRealTimers());

describe("GET /api/admin/stall-refills", () => {
  it("401s a guest before any service-role call", async () => {
    h.state.user = null;
    const res = await GET();
    expect(res.status).toBe(401);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("403s a customer before any service-role call", async () => {
    h.state.user = { id: "c-1", app_metadata: { role: "customer" } };
    const res = await GET();
    expect(res.status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("splits lines into today and yesterday (IST) with names and photos", async () => {
    h.rpc.mockResolvedValue({
      data: [dbRow(), dbRow({ sale_date: "2026-09-26", variant_slug: "frock-moon-3-6m", item_size: "3-6M" })],
      error: null,
    });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(h.rpc).toHaveBeenCalledWith("stall_refill_lines", { p_since: "2026-09-26" });
    const body = await res.json();
    expect(body.today).toMatchObject({
      date: "2026-09-27",
      lines: [{ key: "frock-moon-0-3m", name: "Moon and Stars Frock", pending: 3, stock_now: 1,
                image: PHOTO.replace("1.jpg", "1_thumbnail.webp") }],
    });
    expect(body.yesterday).toMatchObject({ date: "2026-09-26", lines: [{ key: "frock-moon-3-6m" }] });
  });

  it("still lists lines when the catalog snapshot is unavailable", async () => {
    h.getSnapshot.mockRejectedValue(new Error("redis down and fallback failed"));
    h.rpc.mockResolvedValue({ data: [dbRow()], error: null });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.today.lines[0]).toMatchObject({ name: "Moon frock (as billed)", image: null });
  });

  it("500s when the lines query fails", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/admin/stall-refills", () => {
  it("403s a customer before any service-role call", async () => {
    h.state.user = { id: "c-1", app_metadata: { role: "customer" } };
    const res = await post(tick);
    expect(res.status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("400s an invalid tick without calling the database", async () => {
    const res = await post({ ...tick, action: "restocked" });
    expect(res.status).toBe(400);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("400s a list left open past midnight with code STALE_DATE", async () => {
    const res = await post({ ...tick, sale_date: "2026-09-25" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "STALE_DATE" });
  });

  it("records the tick as the signed-in admin, ignoring any id in the body", async () => {
    h.rpc.mockResolvedValue({ data: { id: "r-1", quantity: 3 }, error: null });
    const res = await post({ ...tick, acted_by: "someone-else", p_acted_by: "someone-else" });
    expect(res.status).toBe(201);
    expect(h.rpc).toHaveBeenCalledWith("stall_refill_record", {
      p_sale_date: "2026-09-27",
      p_variant_slug: "frock-moon-0-3m",
      p_action: "refilled",
      p_quantity: 3,
      p_acted_by: "admin-1",
      p_acted_by_name: "Asha",
    });
    expect(await res.json()).toEqual({ refill: { id: "r-1", quantity: 3 } });
  });

  it("409s when another phone already handled the units", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "NOTHING_TO_REFILL", code: "P0001" } });
    const res = await post(tick);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Already handled on another phone" });
  });

  it("404s a size that did not sell that day", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "NOT_SOLD:frock-moon-0-3m", code: "P0001" } });
    const res = await post(tick);
    expect(res.status).toBe(404);
  });
});
