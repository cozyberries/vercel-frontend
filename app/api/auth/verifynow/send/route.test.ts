import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: null as unknown,
  existing: null as null | { userId: string; email: string },
  sendOtp: vi.fn(),
  allowed: true,
  blocked: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
}));
vi.mock("@/lib/auth-phone", () => ({ findUserIdByPhone: vi.fn(async () => h.existing) }));
vi.mock("@/lib/verifynow", () => ({
  getAuthTokenFromEnv: () => "tok",
  sendOtp: h.sendOtp,
  getVerifyNowUserMessage: (m: string) => ({ status: 502, error: m }),
}));
vi.mock("@/lib/utils/impersonation-guard", () => ({ blockIfImpersonating: h.blocked }));
vi.mock("@/lib/upstash", () => ({
  UpstashService: { checkRateLimit: vi.fn(async () => ({ allowed: h.allowed })) },
}));

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { POST } from "./route";

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/auth/verifynow/send", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));

beforeEach(() => {
  h.user = null;
  h.existing = null;
  h.allowed = true;
  h.sendOtp.mockReset().mockResolvedValue({ verificationId: "v1" });
  h.blocked.mockReset().mockResolvedValue(undefined);
  vi.mocked(createServerSupabaseClient).mockClear();
});

describe("POST /api/auth/verifynow/send", () => {
  it("still rejects unknown intents", async () => {
    expect((await post({ phone: "9876543210", intent: "nope" })).status).toBe(400);
  });
  it("login: 404s a number with no account", async () => {
    expect((await post({ phone: "9876543210", intent: "login" })).status).toBe(404);
  });
  it("link: 401s without a session", async () => {
    expect((await post({ phone: "9876543210", intent: "link" })).status).toBe(401);
    expect(h.sendOtp).not.toHaveBeenCalled();
  });
  it("link: 409s a number already on another account", async () => {
    h.user = { id: "me" };
    h.existing = { userId: "other", email: "o@x.in" };
    const res = await post({ phone: "9876543210", intent: "link" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("This number is already on another account");
    expect(h.sendOtp).not.toHaveBeenCalled();
  });
  it("link: sends the OTP for a free number, or one already on this account", async () => {
    h.user = { id: "me" };
    expect((await post({ phone: "9876543210", intent: "link" })).status).toBe(200);
    h.existing = { userId: "me", email: "me@x.in" };
    const res = await post({ phone: "9876543210", intent: "link" });
    expect(await res.json()).toEqual({ verificationId: "v1", timeout: 60 });
  });
  it("link is refused while impersonating", async () => {
    h.user = { id: "me" };
    h.blocked.mockResolvedValue(NextResponse.json({ error: "Forbidden while impersonating" }, { status: 403 }));
    const res = await post({ phone: "9876543210", intent: "link" });
    expect(res.status).toBe(403);
    expect(h.sendOtp).not.toHaveBeenCalled();
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
  it("login is not gated by the impersonation guard", async () => {
    h.existing = { userId: "u1", email: "u1@x.in" };
    const res = await post({ phone: "9876543210", intent: "login" });
    expect(res.status).toBe(200);
    expect(h.blocked).not.toHaveBeenCalled();
  });
  it("link: still honours the rate limit before sending an OTP", async () => {
    h.user = { id: "me" };
    h.allowed = false;
    const res = await post({ phone: "9876543210", intent: "link" });
    expect(res.status).toBe(429);
    expect(h.sendOtp).not.toHaveBeenCalled();
  });
});
