import { describe, expect, it, vi } from "vitest";
import { listAdminAccounts, toAdminAccount } from "./admin-accounts";

const u = (id: string, role: string | undefined, email: string) => ({
  id, email, phone: null, created_at: "2026-01-01T00:00:00Z",
  app_metadata: role ? { role } : {}, user_metadata: { full_name: email.split("@")[0] },
});

describe("listAdminAccounts", () => {
  it("pages through users and keeps only admin roles, super_admin first", async () => {
    const listUsers = vi
      .fn()
      .mockResolvedValueOnce({ data: { users: [u("1", "customer", "c@x.in"), u("2", "admin", "zed@x.in")] }, error: null })
      .mockResolvedValueOnce({ data: { users: [u("3", "super_admin", "owner@x.in")] }, error: null });
    const admin = { auth: { admin: { listUsers } } };
    const r = await listAdminAccounts(admin as never, 2);
    expect(r.map((a) => a.id)).toEqual(["3", "2"]);
    expect(listUsers).toHaveBeenCalledTimes(2);
  });

  it("throws when a page returns an error", async () => {
    const listUsers = vi.fn().mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const admin = { auth: { admin: { listUsers } } };
    await expect(listAdminAccounts(admin as never, 2)).rejects.toThrow("boom");
  });
});

describe("toAdminAccount", () => {
  it("maps the auth user shape", () => {
    expect(toAdminAccount(u("9", "admin", "a@x.in") as never)).toEqual({
      id: "9", email: "a@x.in", phone: null, full_name: "a", role: "admin", created_at: "2026-01-01T00:00:00Z",
    });
  });

  it("maps an empty-string phone to null", () => {
    const withPhone = { ...u("10", "admin", "b@x.in"), phone: "" };
    expect(toAdminAccount(withPhone as never).phone).toBeNull();
  });
});
