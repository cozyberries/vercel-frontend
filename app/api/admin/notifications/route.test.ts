import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => {
  const state = { rows: [] as Row[], unread: 0, isCalls: [] as [string, unknown][] };
  const listChain = {
    is: vi.fn((col: string, v: unknown) => { state.isCalls.push([col, v]); return listChain; }),
    eq: vi.fn(() => listChain),
    order: vi.fn(() => listChain),
    limit: vi.fn(async () => ({ data: state.rows, error: null })),
  };
  const admin = {
    from: vi.fn(() => ({
      select: vi.fn((_c: string, opts?: { head?: boolean }) => {
        if (opts?.head) {
          const countChain: Row = {};
          (countChain.is as unknown) = vi.fn((col: string, v: unknown) => { state.isCalls.push([col, v]); return countChain; });
          (countChain.eq as unknown) = vi.fn(() => Promise.resolve({ count: state.unread, error: null }));
          return countChain;
        }
        return listChain;
      }),
    })),
  };
  return { state, admin, reset: () => { state.rows = []; state.unread = 0; state.isCalls = []; } };
});

vi.mock("@/lib/services/admin-gate", () => ({ requireAdmin: vi.fn(async () => ({ user: { id: "admin-1" } })) }));
vi.mock("@/lib/supabase-server", () => ({ createAdminSupabaseClient: () => h.admin }));

import { GET } from "./route";

beforeEach(() => h.reset());

describe("GET /api/admin/notifications", () => {
  it("returns broadcast rows and unread count, scoped to user_id IS NULL", async () => {
    h.state.rows = [{ id: "n-1", user_id: null, type: "shipping_scan", read: false }];
    h.state.unread = 1;
    const res = await GET(new NextRequest("http://localhost/api/admin/notifications"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notifications: h.state.rows, unread: 1 });
    // Review Focus #5: both queries must filter user_id IS NULL
    expect(h.state.isCalls.filter(([c, v]) => c === "user_id" && v === null)).toHaveLength(2);
  });
});
