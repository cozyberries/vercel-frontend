import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_USER, CUSTOMER_USER, chain } from "./__fixtures__/route-mocks";

const h = vi.hoisted(() => ({ user: null as unknown, from: vi.fn(), loadRetailerList: vi.fn() }));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.user }, error: null }) } })),
  createAdminSupabaseClient: vi.fn(() => ({ from: h.from })),
}));
vi.mock("@/lib/retail/queries", async (orig) => ({ ...(await orig<object>()), loadRetailerList: h.loadRetailerList }));

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { GET, POST } from "./route";

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/admin/retail", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));
const SHOP = { legal_name: "Kids Corner LLP", gstin: "29AAGFC4321M1ZB", address: "12 MG Road" };

beforeEach(() => {
  h.user = ADMIN_USER;
  h.from.mockReset();
  h.loadRetailerList.mockReset();
  vi.mocked(createAdminSupabaseClient).mockClear();
});

describe("/api/admin/retail", () => {
  it("401s a guest and 403s a customer before any service-role client", async () => {
    h.user = null;
    expect((await GET()).status).toBe(401);
    h.user = CUSTOMER_USER;
    expect((await post(SHOP)).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("lists shops with no-store", async () => {
    h.loadRetailerList.mockResolvedValue({ items: [], lastPeriod: "2026-09", missingLastPeriod: [], today: "2026-10-08" });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.json()).toMatchObject({ lastPeriod: "2026-09" });
  });

  it("creates a shop with a normalised GSTIN", async () => {
    const q = chain({ data: { id: "r1", ...SHOP }, error: null });
    h.from.mockReturnValue(q);
    const res = await post({ ...SHOP, gstin: "29aagfc4321m1zb" });
    expect(res.status).toBe(201);
    expect(h.from).toHaveBeenCalledWith("retailers");
    expect(q.ops[0]).toEqual(["insert", [expect.objectContaining({ gstin: "29AAGFC4321M1ZB", our_share_pct: 75 })]]);
  });

  it("refuses a bad GSTIN with 400 and a duplicate with 409", async () => {
    expect((await post({ ...SHOP, gstin: "29AAGFC4321M1ZC" })).status).toBe(400);
    h.from.mockReturnValue(chain({ data: null, error: { code: "23505", message: "duplicate key" } }));
    const res = await post(SHOP);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "A shop with this GSTIN already exists" });
  });
});
