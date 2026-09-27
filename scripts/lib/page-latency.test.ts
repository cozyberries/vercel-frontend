import { describe, expect, it } from "vitest";
import { pageLatency } from "./page-latency.mjs";

const ok = (...ms: number[]) => ms.map((m) => ({ status: 200, ms: m }));

describe("pageLatency", () => {
  it("passes when warm requests are fast, even if the first one hit a cold start", () => {
    // Seen on production 2026-09-27 after 10 idle minutes on Fluid compute.
    expect(pageLatency(ok(979, 88, 95, 110), 600)).toMatchObject({ ok: true, firstMs: 979, warmMs: 95 });
  });

  it("fails when warm requests are slow", () => {
    expect(pageLatency(ok(300, 700, 650, 720), 600)).toMatchObject({ ok: false, warmMs: 700 });
  });

  it("takes the median, so one slow warm request does not fail it", () => {
    expect(pageLatency(ok(200, 90, 900, 100), 600)).toMatchObject({ ok: true, warmMs: 100 });
  });

  it("fails when any request is not a 200", () => {
    const samples = [...ok(200, 100), { status: 500, ms: 90 }, ...ok(100)];
    expect(pageLatency(samples, 600).ok).toBe(false);
  });

  it("fails when there is no warm request to measure", () => {
    expect(pageLatency(ok(100), 600)).toMatchObject({ ok: false, warmMs: null });
  });

  it("says what it measured", () => {
    expect(pageLatency(ok(979, 88, 95, 110), 600).detail).toBe("warm median 95ms (88/95/110); first 979ms");
  });
});
