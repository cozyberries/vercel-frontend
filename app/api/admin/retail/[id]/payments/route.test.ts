import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_USER, CUSTOMER_USER, chain } from "../../__fixtures__/route-mocks";

const h = vi.hoisted(() => ({ user: null as unknown, from: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.user }, error: null }) } })),
  createAdminSupabaseClient: vi.fn(() => ({ from: h.from })),
}));

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { POST } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";
const DOC = "33333333-3333-4333-8333-333333333333";
const post = (body: unknown) =>
  POST(new NextRequest(`http://localhost/api/admin/retail/${ID}/payments`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ id: ID }) });
const PAY = { amount_paise: 150000, paid_on: "2026-10-05", method: "upi", reference: "UTR9" };

beforeEach(() => {
  h.user = ADMIN_USER;
  h.from.mockReset();
  vi.mocked(createAdminSupabaseClient).mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T06:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("POST /api/admin/retail/[id]/payments", () => {
  it("403s a customer before any service-role client", async () => {
    h.user = CUSTOMER_USER;
    expect((await post(PAY)).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("records a payment against this shop as the signed-in admin", async () => {
    const q = chain({ data: { id: "p1" }, error: null });
    h.from.mockReturnValue(q);
    expect((await post(PAY)).status).toBe(201);
    expect(q.ops[0]).toEqual(["insert", [{ ...PAY, doc_id: null, retailer_id: ID, created_by: "admin-1" }]]);
  });

  it("refuses an invoice that is not this shop's issued invoice", async () => {
    h.from.mockReturnValueOnce(chain({ data: null, error: null }));
    const res = await post({ ...PAY, doc_id: DOC });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Pick one of this shop's issued invoices" });
  });
});
