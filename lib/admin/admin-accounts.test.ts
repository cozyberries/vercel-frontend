import { describe, expect, it, vi } from "vitest";
import { isUuid, listAdminAccounts, safeGetUserById, toAdminAccount } from "./admin-accounts";

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

const VALID_UUID = "11111111-1111-1111-1111-111111111111";

describe("isUuid", () => {
  it("accepts a well-formed UUID and rejects everything else", () => {
    expect(isUuid(VALID_UUID)).toBe(true);
    expect(isUuid("zz")).toBe(false);
    expect(isUuid("11111111-1111-1111-1111-11111111111")).toBe(false); // too short
    expect(isUuid("")).toBe(false);
  });
});

describe("safeGetUserById", () => {
  it("returns null and never calls getUserById for a non-UUID id", async () => {
    const getUserById = vi.fn();
    const admin = { auth: { admin: { getUserById } } };
    expect(await safeGetUserById(admin as never, "zz")).toBeNull();
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("returns null when getUserById errors or finds no user", async () => {
    const getUserById = vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "not found" } });
    const admin = { auth: { admin: { getUserById } } };
    expect(await safeGetUserById(admin as never, VALID_UUID)).toBeNull();
  });

  it("returns null instead of throwing when getUserById throws", async () => {
    const getUserById = vi.fn().mockRejectedValue(new Error("invalid input syntax for type uuid"));
    const admin = { auth: { admin: { getUserById } } };
    expect(await safeGetUserById(admin as never, VALID_UUID)).toBeNull();
  });

  it("returns the user on success", async () => {
    const user = u(VALID_UUID, "admin", "a@x.in");
    const getUserById = vi.fn().mockResolvedValue({ data: { user }, error: null });
    const admin = { auth: { admin: { getUserById } } };
    expect(await safeGetUserById(admin as never, VALID_UUID)).toEqual(user);
  });
});
