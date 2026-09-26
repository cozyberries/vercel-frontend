import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { billUrl, signBill, verifyBillSignature } from "./bill-link";

const ORDER = "3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c";
const OTHER = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

beforeEach(() => vi.stubEnv("INVOICE_LINK_SECRET", "x".repeat(32)));
afterEach(() => vi.unstubAllEnvs());

describe("signBill", () => {
  it("is deterministic, URL-safe and 22 characters", () => {
    const sig = signBill(ORDER);
    expect(sig).toBe(signBill(ORDER));
    expect(sig).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("differs per order and per secret", () => {
    const sig = signBill(ORDER);
    expect(signBill(OTHER)).not.toBe(sig);
    vi.stubEnv("INVOICE_LINK_SECRET", "y".repeat(32));
    expect(signBill(ORDER)).not.toBe(sig);
  });

  it("refuses to sign without a strong secret", () => {
    vi.stubEnv("INVOICE_LINK_SECRET", "");
    expect(() => signBill(ORDER)).toThrow("INVOICE_LINK_SECRET");
    vi.stubEnv("INVOICE_LINK_SECRET", "short");
    expect(() => signBill(ORDER)).toThrow("INVOICE_LINK_SECRET");
  });
});

describe("verifyBillSignature", () => {
  it("accepts the order's own signature", () => {
    expect(verifyBillSignature(ORDER, signBill(ORDER))).toBe(true);
  });

  it("rejects another order's signature, a tampered one, and junk", () => {
    const sig = signBill(ORDER);
    expect(verifyBillSignature(OTHER, sig)).toBe(false);
    expect(verifyBillSignature(ORDER, sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A"))).toBe(false);
    expect(verifyBillSignature(ORDER, sig.slice(0, 10))).toBe(false);
    expect(verifyBillSignature(ORDER, "")).toBe(false);
  });
});

describe("billUrl", () => {
  it("points at the public bill route on the live site", () => {
    expect(billUrl(ORDER)).toBe(`https://cozyberries.in/bill/${ORDER}/${signBill(ORDER)}`);
  });
});
