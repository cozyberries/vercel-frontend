import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: null as unknown,
  cache: new Map<string, unknown>(),
  count: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
  createAdminSupabaseClient: vi.fn(() => ({ tag: "admin-client" })),
}));
vi.mock("@/lib/upstash", () => ({
  UpstashService: {
    get: vi.fn(async (k: string) => h.cache.get(k) ?? null),
    set: vi.fn(async (k: string, v: unknown) => {
      h.cache.set(k, v);
    }),
    delete: vi.fn(async (k: string) => {
      h.cache.delete(k);
    }),
  },
}));
vi.mock("@/lib/admin/dashboard-actions", async (orig) => ({
  ...(await orig<typeof import("@/lib/admin/dashboard-actions")>()),
  countDashboardActions: h.count,
}));

import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { GET } from "./route";

beforeEach(() => {
  h.user = { id: "a", app_metadata: { role: "admin" } };
  h.cache.clear();
  h.count.mockReset().mockResolvedValue({ awaiting: 1, to_ship: 2, ready_for_pickup: 3, collected_today: 4, generated_at: "t" });
  vi.mocked(createAdminSupabaseClient).mockClear();
});

describe("GET /api/admin/dashboard/actions", () => {
  it("401s a guest before any service-role call", async () => {
    h.user = null;
    const res = await GET();
    expect(res.status).toBe(401);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });
  it("403s a customer", async () => {
    h.user = { id: "c", app_metadata: { role: "customer" } };
    expect((await GET()).status).toBe(403);
  });
  it("counts, caches for 60 s, and serves the cached copy next time", async () => {
    const first = await (await GET()).json();
    expect(first).toEqual({ actions: expect.objectContaining({ awaiting: 1 }), cached: false });
    const second = await (await GET()).json();
    expect(second.cached).toBe(true);
    expect(h.count).toHaveBeenCalledTimes(1);
    const { UpstashService } = await import("@/lib/upstash");
    expect(UpstashService.set).toHaveBeenCalledWith("admin:dashboard:actions", expect.any(Object), 60);
  });
  it("500s with a generic message when counting throws", async () => {
    h.count.mockRejectedValueOnce(new Error("db exploded"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to load dashboard" });
  });
});
