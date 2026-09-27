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
vi.mock("./stall-refills-client", () => ({ default: () => null }));

import StallRefillsPage from "./page";

beforeEach(() => {
  h.user = null;
});

describe("stall refills page guard", () => {
  it("sends a guest to login and back here", async () => {
    await expect(StallRefillsPage()).rejects.toThrow(/^REDIRECT:\/login\?redirect=\/admin\/stall-refills$/);
  });

  it("sends a customer home without revealing the page", async () => {
    h.user = { id: "c-1", app_metadata: { role: "customer" } };
    await expect(StallRefillsPage()).rejects.toThrow(/^REDIRECT:\/$/);
  });

  it("renders for an admin", async () => {
    h.user = { id: "a-1", app_metadata: { role: "admin" } };
    await expect(StallRefillsPage()).resolves.toBeTruthy();
  });
});
