import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: null as unknown,
  users: new Map<string, Record<string, unknown>>(),
  updateUserById: vi.fn(),
  getUserById: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
  createAdminSupabaseClient: vi.fn(() => ({
    auth: {
      admin: {
        getUserById: h.getUserById,
        updateUserById: h.updateUserById,
      },
    },
  })),
}));

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { DELETE } from "./route";
import { GET } from "../route";
import { requireAdmin } from "@/lib/services/admin-gate";

const SUPER = "11111111-1111-1111-1111-111111111111";
const SUPER2 = "44444444-4444-4444-4444-444444444444";
const ADMIN = "22222222-2222-2222-2222-222222222222";
const CUSTOMER = "33333333-3333-3333-3333-333333333333";
const UNKNOWN_UUID = "99999999-9999-9999-9999-999999999999"; // valid shape, no such user

const u = (id: string, role?: string) => ({
  id, email: `${id}@x.in`, phone: null, created_at: "2026-01-01T00:00:00Z",
  app_metadata: role ? { role } : {}, user_metadata: {},
});
const del = (id: string) =>
  DELETE(new NextRequest(`http://localhost/api/admin/admins/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  h.user = { id: SUPER, app_metadata: { role: "super_admin" } };
  h.users.clear();
  h.users.set(SUPER, u(SUPER, "super_admin"));
  h.users.set(SUPER2, u(SUPER2, "super_admin"));
  h.users.set(ADMIN, u(ADMIN, "admin"));
  h.users.set(CUSTOMER, u(CUSTOMER, "customer"));
  h.getUserById.mockReset().mockImplementation(async (id: string) => ({ data: { user: h.users.get(id) ?? null }, error: null }));
  h.updateUserById.mockReset().mockResolvedValue({ data: {}, error: null });
  vi.mocked(createAdminSupabaseClient).mockClear();
});

describe("DELETE /api/admin/admins/[id]", () => {
  it("401s a guest before any service-role call", async () => {
    h.user = null;
    expect((await del(ADMIN)).status).toBe(401);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });
  it("403s a plain admin before any service-role call", async () => {
    h.user = { id: ADMIN, app_metadata: { role: "admin" } };
    expect((await del(CUSTOMER)).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
    expect(h.updateUserById).not.toHaveBeenCalled();
  });
  it("400s removing yourself", async () => {
    expect((await del(SUPER)).status).toBe(400);
  });
  it("404s a non-UUID id and never calls getUserById", async () => {
    const res = await del("zz");
    expect(res.status).toBe(404);
    expect(h.getUserById).not.toHaveBeenCalled();
  });
  it("404s an unknown id", async () => {
    expect((await del(UNKNOWN_UUID)).status).toBe(404);
  });
  it("409s a super_admin target and a non-admin target", async () => {
    expect((await del(SUPER2)).status).toBe(409);
    expect((await del(CUSTOMER)).status).toBe(409);
    expect(h.updateUserById).not.toHaveBeenCalled();
  });
  it("demotes an admin to customer, scoped to that id", async () => {
    expect((await del(ADMIN)).status).toBe(200);
    expect(h.updateUserById).toHaveBeenCalledWith(ADMIN, { app_metadata: { role: "customer" } });
  });
  it("a removed admin is refused at once", async () => {
    // While still an admin, the admin gate lets them through.
    h.user = { id: ADMIN, app_metadata: { role: "admin" } };
    expect((await requireAdmin()).response).toBeUndefined();

    h.user = { id: SUPER, app_metadata: { role: "super_admin" } };
    expect((await del(ADMIN)).status).toBe(200);

    // getUser() returns the live account, so the demotion applies on the very next
    // request even though the removed admin's old JWT still says "admin".
    h.user = { id: ADMIN, app_metadata: { role: "customer" } };
    vi.mocked(createAdminSupabaseClient).mockClear();
    const res = await GET();
    expect(res.status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
    expect((await requireAdmin()).response?.status).toBe(403);
  });
  it("500s when updateUserById errors", async () => {
    h.updateUserById.mockReset().mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await del(ADMIN)).status).toBe(500);
  });
});
