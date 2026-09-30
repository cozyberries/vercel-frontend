import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
}));

import { requireAdmin, requireSuperAdmin } from "./admin-gate";

beforeEach(() => {
  h.user = null;
});

describe("requireAdmin", () => {
  it("401s a guest", async () => {
    const r = await requireAdmin();
    expect(r.response?.status).toBe(401);
  });
  it("403s a customer", async () => {
    h.user = { id: "c", app_metadata: { role: "customer" } };
    const r = await requireAdmin();
    expect(r.response?.status).toBe(403);
  });
  it("passes an admin", async () => {
    h.user = { id: "a", app_metadata: { role: "admin" } };
    const r = await requireAdmin();
    expect(r.user?.id).toBe("a");
  });
});

describe("requireSuperAdmin", () => {
  it("401s a guest", async () => {
    const r = await requireSuperAdmin();
    expect(r.response?.status).toBe(401);
  });
  it("403s a plain admin, reading the live account not the token", async () => {
    // getUser() is what is mocked here: a stale JWT saying "admin" is irrelevant.
    h.user = { id: "a", app_metadata: { role: "admin" } };
    const r = await requireSuperAdmin();
    expect(r.response?.status).toBe(403);
  });
  it("passes a super_admin", async () => {
    h.user = { id: "s", app_metadata: { role: "super_admin" } };
    const r = await requireSuperAdmin();
    expect(r.user?.id).toBe("s");
  });
});
