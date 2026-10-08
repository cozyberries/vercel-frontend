import { afterEach, describe, expect, it, vi } from "vitest";

// The config is read from env once at import, so every case re-imports a fresh module.
async function loadMrpDisplay(env: Record<string, string>) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  return (await import("./offers")).MRP_DISPLAY;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("MRP_DISPLAY", () => {
  it("defaults to a 10% MRP shown from the launch day (IST)", async () => {
    const mrp = await loadMrpDisplay({});
    expect(mrp.discountRate).toBe(0.1);
    expect(mrp.shownSince.toISOString()).toBe("2026-09-26T18:30:00.000Z");
  });

  it("is switched off with a rate of 0", async () => {
    expect((await loadMrpDisplay({ NEXT_PUBLIC_MRP_DISCOUNT_RATE: "0" })).discountRate).toBe(0);
  });

  it("falls back to 10% when the rate is not a number", async () => {
    expect((await loadMrpDisplay({ NEXT_PUBLIC_MRP_DISCOUNT_RATE: "ten" })).discountRate).toBe(0.1);
  });

  it("switches off rather than divide by zero for a rate of 1 or more", async () => {
    expect((await loadMrpDisplay({ NEXT_PUBLIC_MRP_DISCOUNT_RATE: "1" })).discountRate).toBe(0);
  });

  it("takes the launch date from env and keeps the default when it is unreadable", async () => {
    const custom = await loadMrpDisplay({ NEXT_PUBLIC_MRP_SHOWN_SINCE: "2026-10-01T00:00:00+05:30" });
    expect(custom.shownSince.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    const bad = await loadMrpDisplay({ NEXT_PUBLIC_MRP_SHOWN_SINCE: "soon" });
    expect(bad.shownSince.toISOString()).toBe("2026-09-26T18:30:00.000Z");
  });

  it("ends the MRP display at the start of 7 Oct 2026 (IST), when prices went up 10%", async () => {
    expect((await loadMrpDisplay({})).shownUntil.toISOString()).toBe("2026-10-06T18:30:00.000Z");
  });

  it("takes the end date from env and keeps the default when it is unreadable", async () => {
    const custom = await loadMrpDisplay({ NEXT_PUBLIC_MRP_SHOWN_UNTIL: "2026-11-01T00:00:00+05:30" });
    expect(custom.shownUntil.toISOString()).toBe("2026-10-31T18:30:00.000Z");
    const bad = await loadMrpDisplay({ NEXT_PUBLIC_MRP_SHOWN_UNTIL: "never" });
    expect(bad.shownUntil.toISOString()).toBe("2026-10-06T18:30:00.000Z");
  });
});
