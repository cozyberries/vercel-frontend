import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPickupRequest } from "./client";

const calls: { url: string; init: RequestInit }[] = [];
let reply: { status: number; body: string } = { status: 200, body: "{}" };

beforeEach(() => {
  calls.length = 0;
  reply = { status: 200, body: "{}" };
  vi.stubEnv("DELIVERY_API_KEY", "tok-123");
  vi.stubEnv("DELHIVERY_BASE_URL", "https://dl.example");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(reply.body, { status: reply.status, headers: { "Content-Type": "application/json" } });
    })
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("createPickupRequest", () => {
  const payload = { pickup_time: "14:00:00", pickup_date: "2026-11-06", pickup_location: "Cozyberries", expected_package_count: 1 };

  it("posts the pickup as JSON to /fm/request/new/ with the token header", async () => {
    reply = { status: 200, body: JSON.stringify({ pickup_id: 118775, pickup_time: "14:00:00", pickup_date: "2026-11-06" }) };
    const result = await createPickupRequest(payload);
    expect(calls[0].url).toBe("https://dl.example/fm/request/new/");
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Token tok-123");
    expect((calls[0].init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(calls[0].init.body as string)).toEqual(payload);
    expect(result).toEqual({ ok: true, data: { pickup_id: 118775, pickup_time: "14:00:00", pickup_date: "2026-11-06" } });
  });

  it("returns Delhivery's 400 body and status so the caller can read the refusal", async () => {
    reply = { status: 400, body: "Client wallet balance is 487.81 which is less than 500.0" };
    const result = await createPickupRequest(payload);
    expect(result).toEqual({ ok: false, error: "Client wallet balance is 487.81 which is less than 500.0", statusCode: 400 });
  });
});
