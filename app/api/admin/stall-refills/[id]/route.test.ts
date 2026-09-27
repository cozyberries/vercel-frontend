import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state: Record<string, any> = {};
  const rpc = vi.fn();
  const reset = () => {
    state.user = { id: "admin-1", app_metadata: { role: "admin" }, user_metadata: {} };
    rpc.mockReset();
  };
  return { state, rpc, reset };
});

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.state.user }, error: null }) },
  })),
  createAdminSupabaseClient: vi.fn(() => ({ rpc: h.rpc })),
}));

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { DELETE } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";
const del = (id: string) =>
  DELETE(new NextRequest(`http://localhost/api/admin/stall-refills/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  h.reset();
  vi.mocked(createAdminSupabaseClient).mockClear();
});

describe("DELETE /api/admin/stall-refills/[id]", () => {
  it("401s a guest before any service-role call", async () => {
    h.state.user = null;
    expect((await del(ID)).status).toBe(401);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("403s a customer before any service-role call", async () => {
    h.state.user = { id: "c-1", app_metadata: { role: "customer" } };
    expect((await del(ID)).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("400s an id that is not a uuid", async () => {
    expect((await del("not-a-uuid")).status).toBe(400);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("undoes the tick", async () => {
    h.rpc.mockResolvedValue({ data: { id: ID, action: "no_stock" }, error: null });
    const res = await del(ID);
    expect(res.status).toBe(200);
    expect(h.rpc).toHaveBeenCalledWith("stall_refill_undo", { p_id: ID });
    expect(await res.json()).toEqual({ refill: { id: ID, action: "no_stock" } });
  });

  it("404s a tick that no longer exists", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "NOT_FOUND", code: "P0001" } });
    expect((await del(ID)).status).toBe(404);
  });
});
