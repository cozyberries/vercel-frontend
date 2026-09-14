import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression coverage for the dynamic-render bug found on 2026-09-13: the Redis client sends every
// command as a `cache: "no-store"` fetch, so running the fallback's Redis bookkeeping during a
// render turned `/` and product pages dynamic. The side effects must be scheduled with after().

const scheduled: Array<() => Promise<void>> = [];
let afterThrows = false;
vi.mock("next/server", () => ({
  after: (run: () => Promise<void>) => {
    if (afterThrows) throw new Error("`after` was called outside a request scope");
    scheduled.push(run);
  },
}));

const setIfAbsent = vi.fn(async () => true);
const writeProduct = vi.fn(async () => undefined);
vi.mock("./store", async (importOriginal) => {
  const original = await importOriginal<typeof import("./store")>();
  return { ...original, catalogStore: () => ({ setIfAbsent, writeProduct }) };
});

const notifyCatalogAlert = vi.fn(async () => undefined);
vi.mock("@/lib/services/telegram", () => ({ notifyCatalogAlert: (...args: unknown[]) => notifyCatalogAlert(...args) }));

vi.mock("./supabase", () => ({
  catalogDb: {
    fetchReferenceRows: async () => ({ categories: [], sizes: [], genders: [], colors: [] }),
    fetchProductRows: async () => [],
    fetchRatingRows: async () => [],
  },
}));

import { noteFallback } from "./fallback";

beforeEach(() => {
  scheduled.length = 0;
  afterThrows = false;
  setIfAbsent.mockClear();
  notifyCatalogAlert.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("noteFallback", () => {
  it("logs inline but defers the Redis throttle write and the alert to after()", async () => {
    await noteFallback("snapshot", new Error("snapshot missing"));

    expect(console.warn).toHaveBeenCalledWith("[catalog] fallback for snapshot: snapshot missing");
    expect(scheduled).toHaveLength(1);
    expect(setIfAbsent).not.toHaveBeenCalled();
    expect(notifyCatalogAlert).not.toHaveBeenCalled();

    await scheduled[0]();
    expect(setIfAbsent).toHaveBeenCalledTimes(1);
    expect(notifyCatalogAlert).toHaveBeenCalledWith({ title: "Redis fallback in use", details: "snapshot: snapshot missing" });
  });

  it("runs the side effects inline and awaits them when there is no request scope", async () => {
    afterThrows = true;
    await noteFallback("product:frock", "boom");

    expect(scheduled).toHaveLength(0);
    expect(setIfAbsent).toHaveBeenCalledTimes(1);
    expect(notifyCatalogAlert).toHaveBeenCalledWith({ title: "Redis fallback in use", details: "product:frock: boom" });
  });

  it("does not alert when the Redis throttle says an alert went out recently", async () => {
    afterThrows = true;
    setIfAbsent.mockResolvedValueOnce(false);
    await noteFallback("snapshot", new Error("still missing"));
    expect(notifyCatalogAlert).not.toHaveBeenCalled();
  });
});
