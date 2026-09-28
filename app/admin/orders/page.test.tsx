import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
}));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
}));
vi.mock("./orders-client", () => ({ default: () => null }));

import AdminOrdersPage from "./page";

beforeEach(() => { h.user = null; });

describe("/admin/orders gate", () => {
  it("redirects anonymous users to /login", async () => {
    await expect(AdminOrdersPage()).rejects.toThrow("REDIRECT:/login?redirect=/admin/orders");
  });
  it("redirects non-admins to /", async () => {
    h.user = { id: "u-1", app_metadata: { role: "customer" } };
    await expect(AdminOrdersPage()).rejects.toThrow(/REDIRECT:\/$/);
  });
  it("renders for admins", async () => {
    h.user = { id: "a-1", app_metadata: { role: "admin" } };
    await expect(AdminOrdersPage()).resolves.toBeTruthy();
  });
});
