import { beforeEach, describe, expect, it, vi } from "vitest";
import { doc, line, retailer } from "@/lib/retail/__fixtures__/retail";
import { ADMIN_USER, CUSTOMER_USER } from "../../../__fixtures__/route-mocks";

const h = vi.hoisted(() => ({ user: null as unknown, fetchDoc: vi.fn(), fetchRetailer: vi.fn(), fetchChallanNumbers: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.user }, error: null }) } })),
  createAdminSupabaseClient: vi.fn(() => ({})),
}));
vi.mock("@/lib/retail/queries", async (orig) => ({ ...(await orig<object>()), fetchDoc: h.fetchDoc, fetchRetailer: h.fetchRetailer, fetchChallanNumbers: h.fetchChallanNumbers }));
vi.mock("@/lib/retail/pdf", () => ({
  renderRetailInvoicePdf: vi.fn(async () => Buffer.from("%PDF-invoice")),
  renderChallanPdf: vi.fn(async () => Buffer.from("%PDF-challan")),
}));

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { renderRetailInvoicePdf } from "@/lib/retail/pdf";
import { GET } from "./route";

const DOC = "33333333-3333-4333-8333-333333333333";
const get = () => GET(new NextRequest(`http://localhost/api/admin/retail/docs/${DOC}/pdf`), { params: Promise.resolve({ docId: DOC }) });

beforeEach(() => {
  h.user = ADMIN_USER;
  process.env.BUSINESS_GSTIN = "29EPDPR9174E1ZB";
  h.fetchRetailer.mockResolvedValue(retailer());
  h.fetchChallanNumbers.mockResolvedValue(["CBC/26-27/0001"]);
  vi.mocked(createAdminSupabaseClient).mockClear();
});

describe("GET /api/admin/retail/docs/[docId]/pdf", () => {
  it("403s a customer before any service-role client", async () => {
    h.user = CUSTOMER_USER;
    expect((await get()).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("serves the invoice PDF privately, citing the challans", async () => {
    h.fetchDoc.mockResolvedValue(doc({ id: DOC }));
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(res.headers.get("Content-Disposition")).toBe('inline; filename="CBR-26-27-0001.pdf"');
    expect(h.fetchChallanNumbers).toHaveBeenCalledWith(expect.anything(), ["batch-1"]);
    expect(vi.mocked(renderRetailInvoicePdf).mock.calls[0][0]).toMatchObject({ challanNumbers: ["CBC/26-27/0001"], totals: { totalPaise: 75000 } });
  });

  it("serves a challan PDF", async () => {
    h.fetchDoc.mockResolvedValue(doc({ id: DOC, kind: "challan", period: null, number: "CBC/26-27/0002", consignment_lines: [line()] }));
    expect(await (await get()).text()).toBe("%PDF-challan");
  });

  it("404s a missing document and a return", async () => {
    h.fetchDoc.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    h.fetchDoc.mockResolvedValue(doc({ id: DOC, kind: "return", period: null }));
    expect((await get()).status).toBe(404);
  });
});
