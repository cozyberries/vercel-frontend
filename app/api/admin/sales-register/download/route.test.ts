import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import readExcelFile from "read-excel-file/node";
import { GSTIN, salesRegisterFixture } from "@/lib/gst/__fixtures__/register";
import { buildSalesRegister } from "@/lib/gst/sales-register";

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
const req = (month: string) => new NextRequest(`http://localhost/api/admin/sales-register/download?month=${month}`);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("BUSINESS_GSTIN", GSTIN);
  h.user = { id: "a", app_metadata: { role: "admin" } };
  h.loadSalesRegister.mockReset().mockResolvedValue(salesRegisterFixture());
  vi.mocked(createAdminSupabaseClient).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("GET /api/admin/sales-register/download", () => {
  it("403s a customer before any service-role call", async () => {
    h.user = { id: "c", app_metadata: { role: "customer" } };
    expect((await GET(req("2026-09"))).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("400s a month with no register", async () => {
    expect((await GET(req("2026-08"))).status).toBe(400);
  });

  it("sends the Excel file as a private, unindexed attachment", async () => {
    const res = await GET(req("2026-09"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="cozyberries-sales-register-2026-09.xlsx"');
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    const sheets = await readExcelFile(Buffer.from(await res.arrayBuffer()));
    expect(sheets.map((s) => s.sheet)).toEqual(["Summary", "Invoices", "B2CS", "B2CL", "HSN summary", "Documents issued", "Cancelled earlier"]);
  });

  it("names an unfinished month's file up to today", async () => {
    h.loadSalesRegister.mockResolvedValueOnce(
      buildSalesRegister({ month: "2026-10", orders: [], cancelledEarlier: [], missingNumbers: [], gstin: GSTIN, now: NOW }),
    );
    const res = await GET(req("2026-10"));
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="cozyberries-sales-register-2026-10-upto-03.xlsx"');
  });

  it("500s with a generic message when the read fails", async () => {
    h.loadSalesRegister.mockRejectedValueOnce(new Error("db down"));
    const res = await GET(req("2026-09"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Couldn't download the register" });
  });
});
