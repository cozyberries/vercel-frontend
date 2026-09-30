import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: null as unknown,
  users: new Map<string, Record<string, unknown>>(),
  updateUserById: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
  createAdminSupabaseClient: vi.fn(() => ({
    auth: {
      admin: {
        getUserById: async (id: string) => ({ data: { user: h.users.get(id) ?? null }, error: null }),
        updateUserById: h.updateUserById,
      },
    },
  })),
}));

import { NextRequest } from "next/server";
import { DELETE } from "./route";

const u = (id: string, role?: string) => ({
  id, email: `${id}@x.in`, phone: null, created_at: "2026-01-01T00:00:00Z",
  app_metadata: role ? { role } : {}, user_metadata: {},
});
const del = (id: string) =>
  DELETE(new NextRequest(`http://localhost/api/admin/admins/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  h.user = { id: "s", app_metadata: { role: "super_admin" } };
  h.users.clear();
  h.users.set("s", u("s", "super_admin"));
  h.users.set("s2", u("s2", "super_admin"));
  h.users.set("a", u("a", "admin"));
  h.users.set("c", u("c", "customer"));
  h.updateUserById.mockReset().mockResolvedValue({ data: {}, error: null });
});

describe("DELETE /api/admin/admins/[id]", () => {
  it("403s a plain admin", async () => {
    h.user = { id: "a", app_metadata: { role: "admin" } };
    expect((await del("c")).status).toBe(403);
  });
  it("400s removing yourself", async () => {
    expect((await del("s")).status).toBe(400);
  });
  it("404s an unknown id", async () => {
    expect((await del("zz")).status).toBe(404);
  });
  it("409s a super_admin target and a non-admin target", async () => {
    expect((await del("s2")).status).toBe(409);
    expect((await del("c")).status).toBe(409);
    expect(h.updateUserById).not.toHaveBeenCalled();
  });
  it("demotes an admin to customer, scoped to that id", async () => {
    expect((await del("a")).status).toBe(200);
    expect(h.updateUserById).toHaveBeenCalledWith("a", { app_metadata: { role: "customer" } });
  });
  it("500s when updateUserById errors", async () => {
    h.updateUserById.mockReset().mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await del("a")).status).toBe(500);
  });
});
