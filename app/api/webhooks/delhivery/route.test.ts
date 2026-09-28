import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const state = { inserted: [] as Record<string, unknown>[], insertError: null as { message: string } | null };
  const admin = {
    from: vi.fn(() => ({
      insert: vi.fn(async (row: Record<string, unknown>) => {
        if (state.insertError) return { error: state.insertError };
        state.inserted.push(row);
        return { error: null };
      }),
    })),
  };
  return { state, admin, reset: () => { state.inserted = []; state.insertError = null; } };
});

vi.mock("@/lib/supabase-server", () => ({
  createAdminSupabaseClient: vi.fn(() => h.admin),
}));

import { POST } from "./route";

const SCAN = { AWB: "AWB1", Status: "In Transit", StatusDateTime: "2026-09-28T10:00:00+05:30" };

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/webhooks/delhivery", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
}

beforeEach(() => {
  h.reset();
  vi.stubEnv("DELHIVERY_WEBHOOK_TOKEN", "secret-token");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/webhooks/delhivery", () => {
  it("401 without a token, no insert", async () => {
    const res = await POST(req(SCAN));
    expect(res.status).toBe(401);
    expect(h.state.inserted).toHaveLength(0);
  });

  it("401 on a wrong token", async () => {
    const res = await POST(req(SCAN, { "x-delhivery-token": "nope" }));
    expect(res.status).toBe(401);
  });

  it("500 when DELHIVERY_WEBHOOK_TOKEN is unset", async () => {
    vi.stubEnv("DELHIVERY_WEBHOOK_TOKEN", "");
    const res = await POST(req(SCAN, { "x-delhivery-token": "secret-token" }));
    expect(res.status).toBe(500);
  });

  it("413 when the body exceeds 1MB, no insert", async () => {
    const big = JSON.stringify({ ...SCAN, pad: "x".repeat(1_000_001) });
    const res = await POST(req(big, { "x-delhivery-token": "secret-token" }));
    expect(res.status).toBe(413);
    expect(h.state.inserted).toHaveLength(0);
  });

  it("400 on invalid JSON and on a payload with no valid scan", async () => {
    expect((await POST(req("{not json", { "x-delhivery-token": "secret-token" }))).status).toBe(400);
    expect((await POST(req({ nothing: true }, { "x-delhivery-token": "secret-token" }))).status).toBe(400);
    expect(h.state.inserted).toHaveLength(0);
  });

  it("202 and inserts a pending event on a valid scan", async () => {
    const res = await POST(req(SCAN, { "x-delhivery-token": "secret-token" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.state.inserted).toHaveLength(1);
    expect(h.state.inserted[0]).toMatchObject({
      source: "delhivery",
      event_type: "shipment_scan",
      awb: "AWB1",
      status: "pending",
    });
  });

  it("500 when the insert fails", async () => {
    h.state.insertError = { message: "boom" };
    const res = await POST(req(SCAN, { "x-delhivery-token": "secret-token" }));
    expect(res.status).toBe(500);
  });

  it("401 without token + unset env — auth check ordered first", async () => {
    vi.stubEnv("DELHIVERY_WEBHOOK_TOKEN", "");
    const res = await POST(req(SCAN));
    expect(res.status).toBe(401);
    expect(h.state.inserted).toHaveLength(0);
  });

  it("413 when content-length header exceeds 1MB, no insert", async () => {
    const res = await POST(req(SCAN, { "x-delhivery-token": "secret-token", "content-length": "2000000" }));
    expect(res.status).toBe(413);
    expect(h.state.inserted).toHaveLength(0);
  });
});
