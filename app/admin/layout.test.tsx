import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

const h = vi.hoisted(() => ({ user: null as unknown, shellProps: null as unknown }));

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
vi.mock("@/lib/services/effective-user", () => ({
  isAdmin: (user: unknown) => {
    const u = user as { app_metadata?: { role?: unknown } };
    return u?.app_metadata?.role === "admin" || u?.app_metadata?.role === "super_admin";
  },
  isSuperAdmin: (user: unknown) => {
    const u = user as { app_metadata?: { role?: unknown } };
    return u?.app_metadata?.role === "super_admin";
  },
}));
vi.mock("@/components/admin/AdminShell", async () => {
  const React = await import("react");
  return {
    default: (props: Record<string, unknown>) => {
      h.shellProps = props;
      return React.default.createElement("div", null, props.children);
    },
  };
});

import AdminLayout from "./layout";

beforeEach(() => {
  h.user = null;
  h.shellProps = null;
});

describe("admin layout gate", () => {
  it("sends a guest to login", async () => {
    await expect(AdminLayout({ children: null })).rejects.toThrow(/^REDIRECT:\/login\?redirect=\/admin$/);
  });
  it("sends a customer home", async () => {
    h.user = { id: "c", app_metadata: { role: "customer" } };
    await expect(AdminLayout({ children: null })).rejects.toThrow(/^REDIRECT:\/$/);
  });
  it("renders the shell for an admin with role, phone flag and initials", async () => {
    h.user = { id: "a", email: "asha@cozyberries.in", phone: "", app_metadata: { role: "admin" }, user_metadata: { full_name: "Asha" } };
    const element = await AdminLayout({ children: null });
    renderToString(element as any);
    expect(h.shellProps).toMatchObject({ role: "admin", hasPhone: false, userId: "a", initials: "A" });
  });
  it("passes super_admin through and hasPhone true when a phone is set", async () => {
    h.user = { id: "s", email: "s@x.in", phone: "919876543210", app_metadata: { role: "super_admin" }, user_metadata: {} };
    const element = await AdminLayout({ children: null });
    renderToString(element as any);
    expect(h.shellProps).toMatchObject({ role: "super_admin", hasPhone: true, initials: "S" });
  });
});
