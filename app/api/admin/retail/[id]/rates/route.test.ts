import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_USER, CUSTOMER_USER } from "../../__fixtures__/route-mocks";

const h = vi.hoisted(() => ({ user: null as unknown, rpc: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.user }, error: null }) } })),
  createAdminSupabaseClient: vi.fn(() => ({ rpc: h.rpc })),
}));

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { DELETE, POST } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id: ID }) };
const post = (body: unknown, id = ID) =>
  POST(new NextRequest(`http://localhost/api/admin/retail/${id}/rates`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ id }) });
const del = (query: string) => DELETE(new NextRequest(`http://localhost/api/admin/retail/${ID}/rates?${query}`, { method: "DELETE" }), ctx);

beforeEach(() => {
  h.user = ADMIN_USER;
  h.rpc.mockReset();
  vi.mocked(createAdminSupabaseClient).mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T06:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("/api/admin/retail/[id]/rates", () => {
  it("403s a customer before any service-role client", async () => {
    h.user = CUSTOMER_USER;
    expect((await post({ period: "2026-10", rate_pct: 10 })).status).toBe(403);
    expect((await del("period=2026-10&rate=10")).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("approves a rate as the signed-in admin", async () => {
    h.rpc.mockResolvedValue({ data: null, error: null });
    const res = await post({ period: "2026-10", rate_pct: 10, actor: "evil" });
    expect(res.status).toBe(201);
    expect(h.rpc).toHaveBeenCalledWith("consignment_add_rate", { p_retailer_id: ID, p_period: "2026-10", p_rate_pct: 10, p_actor: "admin-1" });
  });

  it("removes a rate", async () => {
    h.rpc.mockResolvedValue({ data: null, error: null });
    expect((await del("period=2026-10&rate=12.5")).status).toBe(200);
    expect(h.rpc).toHaveBeenCalledWith("consignment_remove_rate", { p_retailer_id: ID, p_period: "2026-10", p_rate_pct: 12.5 });
  });

  it("400s a bad rate or month before calling the database", async () => {
    expect((await post({ period: "2026-10", rate_pct: 0 })).status).toBe(400);
    expect((await del("period=2026-10&rate=")).status).toBe(400);
    expect((await del("period=2026-11&rate=10")).status).toBe(400);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("404s a malformed shop id", async () => {
    expect((await post({ period: "2026-10", rate_pct: 10 }, "nope")).status).toBe(404);
  });

  it("maps database refusals", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "RATE_IN_USE:10" } });
    const res = await del("period=2026-10&rate=10");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "The draft has sales at 10% off. Change the draft first" });
  });
});
