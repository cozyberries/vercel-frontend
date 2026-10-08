import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import readExcelFile from "read-excel-file/node";
import { balance, retailer } from "@/lib/retail/__fixtures__/retail";
import { holdingsFrom } from "@/lib/retail/holdings";
import { buildSalesSheet } from "@/lib/retail/sheet";
import { ADMIN_USER, CUSTOMER_USER } from "../../__fixtures__/route-mocks";

const h = vi.hoisted(() => ({ user: null as unknown, rpc: vi.fn(), loadRetailerDetail: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.user }, error: null }) } })),
  createAdminSupabaseClient: vi.fn(() => ({ rpc: h.rpc })),
}));
vi.mock("@/lib/retail/queries", async (orig) => ({ ...(await orig<object>()), loadRetailerDetail: h.loadRetailerDetail }));

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { GET, POST } from "./route";

const ID = retailer().id;
const ctx = { params: Promise.resolve({ id: ID }) };
const HOLDINGS = holdingsFrom([balance({ held: 3 })], "2026-10-08");
const SHOP = { id: ID, name: "Kids Corner" };

async function upload(file: Blob | null, month = "2026-09") {
  const form = new FormData();
  form.set("month", month);
  if (file) form.set("file", file, "sales.xlsx");
  return POST(new NextRequest(`http://localhost/api/admin/retail/${ID}/sheet`, { method: "POST", body: form }), ctx);
}

async function filled(sold: number | null, month = "2026-09"): Promise<Blob> {
  const book = await readExcelFile(await buildSalesSheet({ shop: SHOP, month, holdings: HOLDINGS }));
  // Rebuild with the Sold cell filled: write the parsed rows back through the builder's shape.
  const { default: writeExcelFile } = await import("write-excel-file/node");
  const data = book.map((s) => ({
    sheet: s.sheet,
    data: s.data.map((r, i) => r.map((v, j) => (s.sheet === "Sales" && i === 1 && j === 5 ? (sold === null ? null : { value: sold, type: Number }) : v === null ? null : { value: v, type: typeof v === "number" ? Number : String }))),
  }));
  const buffer = await writeExcelFile(data as never).toBuffer();
  return new Blob([new Uint8Array(buffer)]);
}

beforeEach(() => {
  h.user = ADMIN_USER;
  h.rpc.mockReset();
  h.loadRetailerDetail.mockResolvedValue({ retailer: retailer(), holdings: HOLDINGS });
  vi.mocked(createAdminSupabaseClient).mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T06:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("/api/admin/retail/[id]/sheet", () => {
  it("403s a customer before any service-role client", async () => {
    h.user = CUSTOMER_USER;
    expect((await GET(new NextRequest(`http://localhost/x?month=2026-09`), ctx)).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("downloads the month's sheet as an attachment", async () => {
    const res = await GET(new NextRequest(`http://localhost/x?month=2026-09`), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="cozyberries-sales-kids-corner-2026-09.xlsx"');
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("400s a future month", async () => {
    expect((await GET(new NextRequest(`http://localhost/x?month=2026-11`), ctx)).status).toBe(400);
  });

  it("turns a filled sheet into the month's draft", async () => {
    h.rpc.mockResolvedValue({ data: "doc-9", error: null });
    const res = await upload(await filled(2));
    expect(res.status).toBe(201);
    expect(h.rpc).toHaveBeenCalledWith("consignment_save_sale", {
      p_retailer_id: ID, p_period: "2026-09", p_lines: [{ variant_slug: "petal-frock-1-2y", quantity: 2 }], p_actor: "admin-1",
    });
  });

  it("422s with row errors and saves nothing", async () => {
    const res = await upload(await filled(9));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "Fix these rows in the sheet and upload it again",
      rowErrors: [{ row: 2, code: "petal-frock-1-2y", message: "Sold 9 of Petal Pops Frock (1-2Y) but the shop holds 3" }],
    });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("400s a sheet for another month, a missing file and an unreadable file", async () => {
    expect((await upload(await filled(1, "2026-08"))).status).toBe(400);
    expect((await upload(null)).status).toBe(400);
    const res = await upload(new Blob(["not a spreadsheet"]));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "That file isn't a readable .xlsx" });
  });

  it("413s a file over 1 MB", async () => {
    expect((await upload(new Blob([new Uint8Array(1_048_577)]))).status).toBe(413);
  });
});
