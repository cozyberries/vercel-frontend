import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  rows: {} as Record<string, unknown>,
}));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: async () => ({ data: h.rows[table] ?? null, error: h.rows[table] ? null : { code: "PGRST116" } }),
          }),
        }),
      }),
    }),
  }),
}));

import { GET } from "./route";
import { NextRequest } from "next/server";

const get = (query: string) => GET(new NextRequest(`http://localhost/api/payments/upi-links?${query}`));

/** Width of a `data:image/png;base64,...` image, read from the PNG IHDR chunk. */
const pngWidth = (dataUrl: string) => Buffer.from(dataUrl.split(",")[1], "base64").readUInt32BE(16);

beforeEach(() => {
  h.user = { id: "user-1" };
  h.rows = {
    orders: {
      id: "order-1",
      order_number: "ORD-20260928-120000-00001",
      total_amount: 2500,
      user_id: "user-1",
      status: "payment_pending",
    },
  };
  // As `vercel env pull` writes them: each value ends in a newline.
  vi.stubEnv("UPI_ID", "cozyberries@idfcbank\n");
  vi.stubEnv("UPI_PAYEE_NAME", "COZYBERRIES\n");
  vi.stubEnv("UPI_MERCHANT_CODE", "5641\n");
  vi.stubEnv("UPI_MERCHANT_ID", "MID10307037564\n");
  vi.stubEnv("UPI_TERMINAL_ID", "TID10307037564A\n");
  vi.stubEnv("UPI_ORG_ID", "180071\n");
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/payments/upi-links", () => {
  it("pays the IDFC merchant account the order total, referenced by order number", async () => {
    const res = await get("orderId=order-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.links.general).toBe(
      "upi://pay?ver=01&mode=01&orgid=180071&pa=cozyberries@idfcbank&pn=COZYBERRIES&mc=5641" +
        "&mid=MID10307037564&mtid=TID10307037564A&qrMedium=04" +
        "&tr=ORD2026092812000000001&am=2500.00&cu=INR&tn=CozyBerries%20order%20ORD-20260928-120000-00001"
    );
    expect(body.links.gpay.startsWith("tez://upi/pay?ver=01&mode=01&orgid=180071&pa=cozyberries@idfcbank")).toBe(true);
    expect(body.payee).toEqual({ upiId: "cozyberries@idfcbank", payeeName: "COZYBERRIES" });
  });

  it("renders the QR large enough to scan off a phone held at arm's length", async () => {
    const body = await (await get("orderId=order-1")).json();
    expect(body.qrCode).toMatch(/^data:image\/png;base64,/);
    expect(pngWidth(body.qrCode)).toBeGreaterThanOrEqual(600);
  });

  it("references a checkout session by its id", async () => {
    h.rows = {
      checkout_sessions: {
        id: "5f0c6e2a-1b2c-4d3e-8f90-a1b2c3d4e5f6",
        total_amount: 999,
        user_id: "user-1",
        status: "pending",
        created_at: new Date().toISOString(),
      },
    };
    const body = await (await get("sessionId=5f0c6e2a-1b2c-4d3e-8f90-a1b2c3d4e5f6")).json();
    expect(body.links.general).toContain("&tr=5f0c6e2a1b2c4d3e8f90a1b2c3d4e5f6&am=999.00&");
  });

  it("is 503 when the UPI account is not configured", async () => {
    vi.stubEnv("UPI_ID", "");
    expect((await get("orderId=order-1")).status).toBe(503);
  });

  it("is 409 once the order is no longer awaiting payment", async () => {
    (h.rows.orders as { status: string }).status = "payment_confirmed";
    expect((await get("orderId=order-1")).status).toBe(409);
  });

  it("is 401 without a session", async () => {
    h.user = null;
    expect((await get("orderId=order-1")).status).toBe(401);
  });
});
