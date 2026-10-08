import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_USER, CUSTOMER_USER, chain } from "../__fixtures__/route-mocks";

const h = vi.hoisted(() => ({ user: null as unknown, from: vi.fn(), loadRetailerDetail: vi.fn() }));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.user }, error: null }) } })),
  createAdminSupabaseClient: vi.fn(() => ({ from: h.from })),
}));
vi.mock("@/lib/retail/queries", async (orig) => ({ ...(await orig<object>()), loadRetailerDetail: h.loadRetailerDetail }));

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { GET, PATCH } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const req = (body?: unknown) =>
  new NextRequest(`http://localhost/api/admin/retail/${ID}`, { method: body ? "PATCH" : "GET", body: body ? JSON.stringify(body) : undefined, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  h.user = ADMIN_USER;
  h.from.mockReset();
  h.loadRetailerDetail.mockReset();
  vi.mocked(createAdminSupabaseClient).mockClear();
});

describe("/api/admin/retail/[id]", () => {
  it("403s a customer before any service-role client", async () => {
    h.user = CUSTOMER_USER;
    expect((await GET(req(), ctx())).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("404s a malformed id and an unknown shop", async () => {
    expect((await GET(req(), ctx("nope"))).status).toBe(404);
    h.loadRetailerDetail.mockResolvedValue(null);
    expect((await GET(req(), ctx())).status).toBe(404);
  });

  it("returns the detail", async () => {
    h.loadRetailerDetail.mockResolvedValue({ retailer: { id: ID }, holdings: [] });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ detail: { retailer: { id: ID }, holdings: [] } });
  });

  it("updates a shop scoped by its id and stamps updated_at", async () => {
    const q = chain({ data: { id: ID }, error: null });
    h.from.mockReturnValue(q);
    const res = await PATCH(req({ legal_name: "Kids Corner LLP", gstin: "29AAGFC4321M1ZB", address: "x", our_share_pct: 70, active: false }), ctx());
    expect(res.status).toBe(200);
    expect(q.ops).toContainEqual(["update", [expect.objectContaining({ our_share_pct: 70, active: false, updated_at: expect.any(String) })]]);
    expect(q.ops).toContainEqual(["eq", ["id", ID]]);
  });

  it("404s an update to a shop that does not exist", async () => {
    h.from.mockReturnValue(chain({ data: null, error: null }));
    expect((await PATCH(req({ legal_name: "A", gstin: "29AAGFC4321M1ZB", address: "x" }), ctx())).status).toBe(404);
  });
});
