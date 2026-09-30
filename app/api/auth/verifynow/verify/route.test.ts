import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: null as unknown,
  existing: null as null | { userId: string; email: string },
  validateOtp: vi.fn(),
  updateUserById: vi.fn(),
  generateLink: vi.fn(),
  blocked: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
  createAdminSupabaseClient: vi.fn(() => ({
    auth: { admin: { updateUserById: h.updateUserById, generateLink: h.generateLink, getUserById: vi.fn() } },
  })),
}));
vi.mock("@/lib/auth-phone", () => ({
  findUserIdByPhone: vi.fn(async () => h.existing),
  findAuthUserByEmail: vi.fn(),
  createPhoneUser: vi.fn(),
}));
vi.mock("@/lib/utils/impersonation-guard", () => ({ blockIfImpersonating: h.blocked }));
vi.mock("@/lib/verifynow", () => ({
  getAuthTokenFromEnv: () => "tok",
  validateOtp: h.validateOtp,
  getVerifyNowUserMessage: (m: string) => ({ status: 400, error: m }),
}));

import { NextRequest, NextResponse } from "next/server";
import { POST } from "./route";

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/auth/verifynow/verify", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));
const link = { verificationId: "v1", code: "1234", intent: "link", phone: "9876543210" };

beforeEach(() => {
  h.user = null;
  h.existing = null;
  h.validateOtp.mockReset().mockResolvedValue(undefined);
  h.updateUserById.mockReset().mockResolvedValue({ data: {}, error: null });
  h.generateLink.mockReset();
  h.blocked.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/auth/verifynow/verify (link)", () => {
  it("401s without a session before validating the code", async () => {
    expect((await post(link)).status).toBe(401);
    expect(h.validateOtp).not.toHaveBeenCalled();
  });
  it("link is refused while impersonating", async () => {
    h.user = { id: "me" };
    h.blocked.mockResolvedValue(NextResponse.json({ error: "Forbidden while impersonating" }, { status: 403 }));
    const res = await post(link);
    expect(res.status).toBe(403);
    expect(h.validateOtp).not.toHaveBeenCalled();
    expect(h.updateUserById).not.toHaveBeenCalled();
  });
  it("400s a wrong code", async () => {
    h.user = { id: "me" };
    h.validateOtp.mockRejectedValue(new Error("Invalid OTP"));
    expect((await post(link)).status).toBe(400);
    expect(h.updateUserById).not.toHaveBeenCalled();
  });
  it("409s a number on another account even after a valid code", async () => {
    h.user = { id: "me" };
    h.existing = { userId: "other", email: "o@x.in" };
    expect((await post(link)).status).toBe(409);
    expect(h.updateUserById).not.toHaveBeenCalled();
  });
  it("sets the phone on the caller only and returns no redirect", async () => {
    h.user = { id: "me" };
    const res = await post(link);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, phone: "9876543210" });
    expect(h.updateUserById).toHaveBeenCalledWith("me", { phone: "9876543210", phone_confirm: true });
    expect(h.generateLink).not.toHaveBeenCalled();
  });
  it("link: a number already on the caller's own account still succeeds", async () => {
    h.user = { id: "me" };
    h.existing = { userId: "me", email: "me@x.in" };
    const res = await post(link);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, phone: "9876543210" });
    expect(h.updateUserById).toHaveBeenCalledWith("me", { phone: "9876543210", phone_confirm: true });
  });
  it("register/login paths still call generateLink and return a redirectUrl", async () => {
    h.existing = { userId: "u1", email: "u1@x.in" };
    h.generateLink.mockResolvedValue({
      data: { properties: { hashed_token: "h" } },
      error: null,
    });
    const res = await post({ verificationId: "v1", code: "1234", intent: "login", phone: "9876543210" });
    expect(res.status).toBe(200);
    expect(h.generateLink).toHaveBeenCalled();
    expect((await res.json()).redirectUrl).toBeTruthy();
  });
});
