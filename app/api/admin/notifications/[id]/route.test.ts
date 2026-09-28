import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => {
  const state = { updated: null as Row | null, scopes: [] as [string, unknown][] };
  const admin = {
    from: vi.fn(() => ({
      update: vi.fn(() => {
        const chain: Row = {};
        (chain.eq as unknown) = vi.fn((c: string, v: unknown) => { state.scopes.push([c, v]); return chain; });
        (chain.is as unknown) = vi.fn((c: string, v: unknown) => { state.scopes.push([c, v]); return chain; });
        (chain.select as unknown) = vi.fn(() => ({ maybeSingle: async () => ({ data: state.updated, error: null }) }));
        return chain;
      }),
    })),
  };
  return { state, admin, reset: () => { state.updated = null; state.scopes = []; } };
});

vi.mock("@/lib/services/admin-gate", () => ({ requireAdmin: vi.fn(async () => ({ user: { id: "admin-1" } })) }));
vi.mock("@/lib/supabase-server", () => ({ createAdminSupabaseClient: () => h.admin }));

import { PATCH } from "./route";

const params = { params: Promise.resolve({ id: "n-1" }) };
const req = (body: Row) =>
  new NextRequest("http://localhost/x", { method: "PATCH", body: JSON.stringify(body) });

beforeEach(() => h.reset());

describe("PATCH /api/admin/notifications/[id]", () => {
  it("400 when read is not a boolean", async () => {
    expect((await PATCH(req({ read: "yes" }), params)).status).toBe(400);
  });

  it("marks read, scoped to id AND user_id IS NULL", async () => {
    h.state.updated = { id: "n-1", read: true };
    const res = await PATCH(req({ read: true }), params);
    expect(res.status).toBe(200);
    expect(h.state.scopes).toEqual(expect.arrayContaining([["id", "n-1"], ["user_id", null]]));
  });

  it("404 for a customer-owned notification id (scope matches nothing)", async () => {
    h.state.updated = null; // .is('user_id', null) excluded the row
    expect((await PATCH(req({ read: true }), params)).status).toBe(404);
  });
});
