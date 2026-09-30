import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
}));
vi.mock("./admins-client", () => ({ default: () => null }));

import AdminsPage from "./page";

beforeEach(() => {
  h.user = null;
});

describe("admins page guard", () => {
  it("sends a guest to login", async () => {
    await expect(AdminsPage()).rejects.toThrow(/^REDIRECT:\/login\?redirect=\/admin\/admins$/);
  });
  it("sends a plain admin to the dashboard", async () => {
    h.user = { id: "a", app_metadata: { role: "admin" } };
    await expect(AdminsPage()).rejects.toThrow(/^REDIRECT:\/admin$/);
  });
  it("sends a customer home", async () => {
    h.user = { id: "c", app_metadata: { role: "customer" } };
    await expect(AdminsPage()).rejects.toThrow(/^REDIRECT:\/$/);
  });
  it("renders for a super_admin", async () => {
    h.user = { id: "s", app_metadata: { role: "super_admin" } };
    await expect(AdminsPage()).resolves.toBeTruthy();
  });
});
