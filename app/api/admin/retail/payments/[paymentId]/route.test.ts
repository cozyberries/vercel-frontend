import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_USER, CUSTOMER_USER, chain } from "../../__fixtures__/route-mocks";

const h = vi.hoisted(() => ({ user: null as unknown, from: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.user }, error: null }) } })),
  createAdminSupabaseClient: vi.fn(() => ({ from: h.from })),
}));

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { DELETE } from "./route";

const PID = "44444444-4444-4444-8444-444444444444";
const del = (id = PID) => DELETE(new NextRequest(`http://localhost/api/admin/retail/payments/${id}`, { method: "DELETE" }), { params: Promise.resolve({ paymentId: id }) });

beforeEach(() => {
  h.user = ADMIN_USER;
  h.from.mockReset();
  vi.mocked(createAdminSupabaseClient).mockClear();
});

describe("DELETE /api/admin/retail/payments/[paymentId]", () => {
  it("403s a customer before any service-role client", async () => {
    h.user = CUSTOMER_USER;
    expect((await del()).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });
  it("deletes by id, 404 when nothing matched", async () => {
    const q = chain({ data: [{ id: PID }], error: null });
    h.from.mockReturnValue(q);
    expect((await del()).status).toBe(200);
    expect(q.ops).toContainEqual(["eq", ["id", PID]]);
    h.from.mockReturnValue(chain({ data: [], error: null }));
    expect((await del()).status).toBe(404);
  });
});
