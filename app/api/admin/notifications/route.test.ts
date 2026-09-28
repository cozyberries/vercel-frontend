import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => {
  const state = { rows: [] as Row[], unread: 0, isCalls: [] as [string, unknown][], listError: null as any, countError: null as any };
  const listChain = {
    is: vi.fn((col: string, v: unknown) => { state.isCalls.push([col, v]); return listChain; }),
    eq: vi.fn(() => listChain),
    order: vi.fn(() => listChain),
    limit: vi.fn((n: number) => { state.isCalls.push(["limit", n]); return Promise.resolve({ data: state.rows, error: state.listError }); }),
  };
  const admin = {
    from: vi.fn(() => ({
      select: vi.fn((_c: string, opts?: { head?: boolean }) => {
        if (opts?.head) {
          const countChain: Row = {};
          (countChain.is as unknown) = vi.fn((col: string, v: unknown) => { state.isCalls.push([col, v]); return countChain; });
          (countChain.eq as unknown) = vi.fn((col: string, v: unknown) => { state.isCalls.push([col, v]); return Promise.resolve({ count: state.unread, error: state.countError }); });
          return countChain;
        }
        return listChain;
      }),
    })),
  };
  return { state, admin, reset: () => { state.rows = []; state.unread = 0; state.isCalls = []; state.listError = null; state.countError = null; } };
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
    // Fix #2: count query must include read=false filter
    expect(h.state.isCalls).toContainEqual(["read", false]);
  });

  it("clamps limit: ?limit=500 → 100, ?limit=abc → 30, no param → 30", async () => {
    const test = async (paramStr: string, expectedLimit: number) => {
      h.reset();
      await GET(new NextRequest(`http://localhost/api/admin/notifications${paramStr}`));
      expect(h.state.isCalls.filter(([c]) => c === "limit")).toEqual([["limit", expectedLimit]]);
    };
    await test("?limit=500", 100);
    await test("?limit=abc", 30);
    await test("", 30);
  });

  it("500 when list query errors", async () => {
    h.state.listError = { message: "list failed" };
    const res = await GET(new NextRequest("http://localhost/api/admin/notifications"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "list failed" });
  });

  it("500 when count query errors", async () => {
    h.state.countError = { message: "count failed" };
    const res = await GET(new NextRequest("http://localhost/api/admin/notifications"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "count failed" });
  });
});
