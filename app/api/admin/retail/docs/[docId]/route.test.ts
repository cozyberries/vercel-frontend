import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_USER, CUSTOMER_USER } from "../../__fixtures__/route-mocks";

const h = vi.hoisted(() => ({ user: null as unknown, rpc: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.user }, error: null }) } })),
  createAdminSupabaseClient: vi.fn(() => ({ rpc: h.rpc })),
}));

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { POST } from "./route";

const DOC = "33333333-3333-4333-8333-333333333333";
const call = (body: unknown, id = DOC) =>
  POST(new NextRequest(`http://localhost/api/admin/retail/docs/${id}`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ docId: id }) });

beforeEach(() => {
  h.user = ADMIN_USER;
  h.rpc.mockReset();
  vi.mocked(createAdminSupabaseClient).mockClear();
});

describe("POST /api/admin/retail/docs/[docId]", () => {
  it("403s a customer before any service-role client", async () => {
    h.user = CUSTOMER_USER;
    expect((await call({ action: "issue" })).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });
  it("issues", async () => {
    h.rpc.mockResolvedValue({ data: { id: DOC, number: "CBR/26-27/0001" }, error: null });
    const res = await call({ action: "issue" });
    expect(h.rpc).toHaveBeenCalledWith("consignment_issue", { p_doc_id: DOC });
    expect(await res.json()).toEqual({ doc: { id: DOC, number: "CBR/26-27/0001" } });
  });
  it("cancels and maps TOO_LATE", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "TOO_LATE" } });
    const res = await call({ action: "cancel" });
    expect(h.rpc).toHaveBeenCalledWith("consignment_cancel", { p_doc_id: DOC });
    expect(res.status).toBe(409);
  });
  it("400s an unknown action and 404s a malformed id", async () => {
    expect((await call({ action: "explode" })).status).toBe(400);
    expect((await call({ action: "issue" }, "x")).status).toBe(404);
  });
});
