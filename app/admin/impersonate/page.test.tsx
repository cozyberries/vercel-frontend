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
vi.mock("./impersonate-client", () => ({ default: () => null }));

import ImpersonatePage from "./page";

beforeEach(() => {
  h.user = null;
});

describe("impersonate page guard", () => {
  it("sends a guest to login and back here", async () => {
    await expect(ImpersonatePage()).rejects.toThrow(/^REDIRECT:\/login\?redirect=\/admin\/impersonate$/);
  });
  it("sends a customer home", async () => {
    h.user = { id: "c", app_metadata: { role: "customer" } };
    await expect(ImpersonatePage()).rejects.toThrow(/^REDIRECT:\/$/);
  });
  it("renders for an admin", async () => {
    h.user = { id: "a", app_metadata: { role: "admin" } };
    await expect(ImpersonatePage()).resolves.toBeTruthy();
  });
});
