import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: null as unknown,
  users: new Map<string, Record<string, unknown>>(),
  updateUserById: vi.fn(),
  getUserById: vi.fn(),
  listUsersError: null as { message: string } | null,
}));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
  createAdminSupabaseClient: vi.fn(() => ({
    auth: {
      admin: {
        listUsers: async () =>
          h.listUsersError
            ? { data: null, error: h.listUsersError }
            : { data: { users: [...h.users.values()] }, error: null },
        getUserById: h.getUserById,
        updateUserById: h.updateUserById,
      },
    },
  })),
}));

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { GET, POST } from "./route";

const SUPER = "11111111-1111-1111-1111-111111111111";
const ADMIN = "22222222-2222-2222-2222-222222222222";
const CUSTOMER = "33333333-3333-3333-3333-333333333333";
const UNKNOWN_UUID = "99999999-9999-9999-9999-999999999999"; // valid shape, no such user

const u = (id: string, role?: string) => ({
  id, email: `${id}@x.in`, phone: null, created_at: "2026-01-01T00:00:00Z",
  app_metadata: role ? { role } : {}, user_metadata: {},
});
const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/admin/admins", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));

beforeEach(() => {
  h.user = { id: SUPER, app_metadata: { role: "super_admin" } };
  h.users.clear();
  h.users.set(SUPER, u(SUPER, "super_admin"));
  h.users.set(ADMIN, u(ADMIN, "admin"));
  h.users.set(CUSTOMER, u(CUSTOMER, "customer"));
  h.listUsersError = null;
  h.getUserById.mockReset().mockImplementation(async (id: string) => ({ data: { user: h.users.get(id) ?? null }, error: null }));
  h.updateUserById.mockReset().mockImplementation(async (id: string, patch: { app_metadata: { role: string } }) => {
    const cur = h.users.get(id)!;
    h.users.set(id, { ...cur, app_metadata: patch.app_metadata });
    return { data: { user: h.users.get(id) }, error: null };
  });
  vi.mocked(createAdminSupabaseClient).mockClear();
});

describe("GET /api/admin/admins", () => {
  it("401s a guest and 403s a plain admin before any service-role call", async () => {
    h.user = null;
    expect((await GET()).status).toBe(401);
    h.user = { id: ADMIN, app_metadata: { role: "admin" } };
    expect((await GET()).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });
  it("lists admin accounts for a super_admin", async () => {
    const body = await (await GET()).json();
    expect(body.admins.map((a: { id: string }) => a.id)).toEqual([SUPER, ADMIN]);
  });
  it("500s when listUsers errors", async () => {
    h.listUsersError = { message: "down" };
    expect((await GET()).status).toBe(500);
  });
});

describe("POST /api/admin/admins", () => {
  it("400s without user_id", async () => {
    expect((await post({})).status).toBe(400);
  });

  it("401s a guest and 403s a plain admin before any service-role call", async () => {
    h.user = null;
    expect((await post({ user_id: CUSTOMER })).status).toBe(401);
    h.user = { id: ADMIN, app_metadata: { role: "admin" } };
    expect((await post({ user_id: CUSTOMER })).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("404s a non-UUID id and never calls getUserById", async () => {
    const res = await post({ user_id: "zz" });
    expect(res.status).toBe(404);
    expect(h.getUserById).not.toHaveBeenCalled();
  });

  it("404s an unknown user", async () => {
    expect((await post({ user_id: UNKNOWN_UUID })).status).toBe(404);
  });
  it("409s an existing admin or super_admin", async () => {
    expect((await post({ user_id: ADMIN })).status).toBe(409);
    expect((await post({ user_id: SUPER })).status).toBe(409);
    expect(h.updateUserById).not.toHaveBeenCalled();
  });
  it("promotes a customer to admin, scoped to that id", async () => {
    const res = await post({ user_id: CUSTOMER });
    expect(res.status).toBe(200);
    expect(h.updateUserById).toHaveBeenCalledWith(CUSTOMER, { app_metadata: { role: "admin" } });
    expect((await res.json()).admin).toMatchObject({ id: CUSTOMER, role: "admin" });
  });
  it("500s when updateUserById errors", async () => {
    h.updateUserById.mockReset().mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await post({ user_id: CUSTOMER });
    expect(res.status).toBe(500);
  });
});
