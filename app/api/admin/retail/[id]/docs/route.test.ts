import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_USER, CUSTOMER_USER } from "../../__fixtures__/route-mocks";

const h = vi.hoisted(() => ({ user: null as unknown, rpc: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.user }, error: null }) } })),
  createAdminSupabaseClient: vi.fn(() => ({ rpc: h.rpc })),
}));

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { POST } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id: ID }) };
const post = (body: unknown) =>
  POST(new NextRequest(`http://localhost/api/admin/retail/${ID}/docs`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }), ctx);

beforeEach(() => {
  h.user = ADMIN_USER;
  h.rpc.mockReset();
  vi.mocked(createAdminSupabaseClient).mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T06:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("POST /api/admin/retail/[id]/docs", () => {
  it("403s a customer before any service-role client", async () => {
    h.user = CUSTOMER_USER;
    expect((await post({ kind: "sale", period: "2026-09", lines: [] })).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("saves a challan as the signed-in admin, never a body actor", async () => {
    h.rpc.mockResolvedValue({ data: "doc-1", error: null });
    const res = await post({ kind: "challan", doc_date: "2026-10-08", lines: [{ variant_slug: "a", quantity: 2, mrp_paise: 100000 }], actor: "evil" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ doc_id: "doc-1" });
    expect(h.rpc).toHaveBeenCalledWith("consignment_save_challan", {
      p_retailer_id: ID, p_doc_date: "2026-10-08", p_lines: [{ variant_slug: "a", quantity: 2, mrp_paise: 100000 }], p_actor: "admin-1", p_doc_id: null,
    });
  });

  it("saves a return and a sale with their own functions", async () => {
    h.rpc.mockResolvedValue({ data: "doc-2", error: null });
    await post({ kind: "return", doc_date: "2026-10-08", lines: [{ variant_slug: "a", quantity: 1 }] });
    expect(h.rpc).toHaveBeenLastCalledWith("consignment_save_return", expect.objectContaining({ p_lines: [{ variant_slug: "a", quantity: 1 }] }));
    await post({ kind: "sale", period: "2026-09", lines: [] });
    expect(h.rpc).toHaveBeenLastCalledWith("consignment_save_sale", { p_retailer_id: ID, p_period: "2026-09", p_lines: [], p_actor: "admin-1" });
  });

  it("maps a function error to its status and message", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "NOT_HELD:1:Petal Pops Frock 1-2Y" } });
    const res = await post({ kind: "sale", period: "2026-09", lines: [{ variant_slug: "a", quantity: 2 }] });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "The shop holds only 1 of Petal Pops Frock 1-2Y" });
  });

  it("400s a future date before calling the database", async () => {
    expect((await post({ kind: "challan", doc_date: "2026-10-09", lines: [{ variant_slug: "a", quantity: 1, mrp_paise: 1 }] })).status).toBe(400);
    expect(h.rpc).not.toHaveBeenCalled();
  });
});
