import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { salesRegisterFixture } from "@/lib/gst/__fixtures__/register";

const h = vi.hoisted(() => ({ user: null as unknown, loadSalesRegister: vi.fn() }));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
  createAdminSupabaseClient: vi.fn(() => ({ tag: "admin-client" })),
}));
vi.mock("@/lib/gst/register-orders", () => ({ loadSalesRegister: h.loadSalesRegister }));

import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { GET } from "./route";

const NOW = new Date("2026-10-03T04:30:00.000Z");
const req = (query = "?month=2026-09") => new NextRequest(`http://localhost/api/admin/sales-register${query}`);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("BUSINESS_GSTIN", "29EPDPR9174E1ZB");
  h.user = { id: "a", app_metadata: { role: "admin" } };
  h.loadSalesRegister.mockReset().mockResolvedValue(salesRegisterFixture());
  vi.mocked(createAdminSupabaseClient).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("GET /api/admin/sales-register", () => {
  it("401s a guest and 403s a customer before any service-role call", async () => {
    h.user = null;
    expect((await GET(req())).status).toBe(401);
    h.user = { id: "c", app_metadata: { role: "customer" } };
    expect((await GET(req())).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
    expect(h.loadSalesRegister).not.toHaveBeenCalled();
  });

  it.each(["", "?month=2026-08", "?month=2026-11", "?month=2026-13", "?month=26-09"])("400s a month with no register (%s)", async (query) => {
    const res = await GET(req(query));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Pick a month from 2026-09 to 2026-10 (YYYY-MM)" });
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("500s with a clear message when the GSTIN is not configured", async () => {
    vi.stubEnv("BUSINESS_GSTIN", "");
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "The GSTIN is not configured, so no register can be made" });
    expect(h.loadSalesRegister).not.toHaveBeenCalled();
  });

  it("returns the month's register, never stored by the browser", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await res.json()).register.totals.issued).toBe(3);
    expect(h.loadSalesRegister).toHaveBeenCalledWith({ tag: "admin-client" }, expect.objectContaining({ month: "2026-09", gstin: "29EPDPR9174E1ZB", now: NOW }));
  });

  it("500s with a generic message when the read fails", async () => {
    h.loadSalesRegister.mockRejectedValueOnce(new Error("db down"));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Couldn't load the sales register" });
  });
});
