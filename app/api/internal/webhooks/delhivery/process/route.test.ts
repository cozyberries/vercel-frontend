import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "crypto";

const h = vi.hoisted(() => ({
  batch: vi.fn(async () => ({ claimed: 0, processed: 0, failed: 0, skipped: 0 })),
  verify: vi.fn(async () => true),
}));

vi.mock("@/lib/services/webhook-processor", () => ({ processWebhookEventBatch: h.batch }));
vi.mock("@upstash/qstash", () => ({
  // `Receiver` is a real ES6 class instantiated with `new` in the route, so the
  // mock must use a `function`/`class` implementation — vi.fn() cannot wrap an
  // arrow function and still support `new` (arrow functions are never
  // constructible; this is a JS-level restriction, not a vitest one).
  Receiver: vi.fn(function () {
    return { verify: h.verify };
  }),
}));

import { POST } from "./route";

const PATH = "/api/internal/webhooks/delhivery/process";
const TOKEN = "internal-job-token-1234567890abcdef";

function internalReq(over: { ts?: string; sig?: string; token?: string } = {}) {
  const ts = over.ts ?? String(Date.now());
  const sig =
    over.sig ?? createHmac("sha256", TOKEN).update(`${ts}:${PATH}`).digest("hex");
  return new NextRequest(`http://localhost${PATH}`, {
    method: "POST",
    body: "{}",
    headers: {
      "x-internal-job-token": over.token ?? TOKEN,
      "x-job-ts": ts,
      "x-job-sig": sig,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("INTERNAL_JOB_TOKEN", TOKEN);
  vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", "cur");
  vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", "next");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/internal/webhooks/delhivery/process", () => {
  it("runs the batch on a valid QStash signature", async () => {
    const req = new NextRequest(`http://localhost${PATH}`, {
      method: "POST",
      body: "{}",
      headers: { "upstash-signature": "sig" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(h.verify).toHaveBeenCalled();
    expect(h.batch).toHaveBeenCalled();
  });

  it("401 on a bad QStash signature", async () => {
    h.verify.mockResolvedValueOnce(false);
    const req = new NextRequest(`http://localhost${PATH}`, {
      method: "POST",
      body: "{}",
      headers: { "upstash-signature": "bad" },
    });
    expect((await POST(req)).status).toBe(401);
    expect(h.batch).not.toHaveBeenCalled();
  });

  it("runs the batch on a valid internal HMAC", async () => {
    const res = await POST(internalReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      result: { claimed: 0, processed: 0, failed: 0, skipped: 0 },
    });
  });

  it("401 on wrong token, stale ts, or bad sig", async () => {
    expect((await POST(internalReq({ token: "wrong" }))).status).toBe(401);
    expect((await POST(internalReq({ ts: String(Date.now() - 6 * 60_000) }))).status).toBe(401);
    expect((await POST(internalReq({ sig: "deadbeef" }))).status).toBe(401);
    expect(h.batch).not.toHaveBeenCalled();
  });

  it("500 with PROCESSOR_ERROR when the batch throws", async () => {
    h.batch.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(internalReq());
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("PROCESSOR_ERROR");
  });
});
