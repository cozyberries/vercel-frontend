import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FILTERS } from "@/lib/catalog/filter";
import type { Snapshot } from "@/lib/catalog/types";
import { fetchCatalog, fetchRanking, newerSnapshot } from "./useCatalog";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchRanking", () => {
  it("passes the query and the filter facets, and returns slugs", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ version: "v", q: "frock", slugs: ["a"] }), { status: 200 });
    }) as typeof fetch;
    expect(await fetchRanking("frock", { ...DEFAULT_FILTERS, gender: "girl" })).toEqual(["a"]);
    // `design` narrows the ranking; `colour` is applied locally, so it is deliberately not sent.
    expect(calls[0]).toBe("/api/search?q=frock&category=all&gender=girl&size=all&age=all&design=all&featured=false");
  });

  it("returns null when the request fails", async () => {
    globalThis.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as typeof fetch;
    expect(await fetchRanking("frock", DEFAULT_FILTERS)).toBeNull();
  });
});

// Regression (2026-09-14): right after a catalog rebuild the service worker (stale-while-revalidate)
// and the persisted query cache handed the browser an OLDER snapshot than the server-rendered one,
// so the new Colour filter vanished for one page load. A fetched snapshot must never replace a
// newer one already in hand.
describe("newerSnapshot", () => {
  const snap = (version: string, generatedAt: string) => ({ version, generatedAt, products: [], reference: {} }) as unknown as Snapshot;

  it("keeps the current snapshot when the fetched one was generated earlier", () => {
    const current = snap("new", "2026-09-14T05:00:00.000Z");
    const fetched = snap("old", "2026-09-13T14:07:25.583Z");
    expect(newerSnapshot(current, fetched)).toBe(current);
  });
  it("takes the fetched snapshot when it is newer, and when nothing is held yet", () => {
    const current = snap("old", "2026-09-13T14:07:25.583Z");
    const fetched = snap("new", "2026-09-14T05:00:00.000Z");
    expect(newerSnapshot(current, fetched)).toBe(fetched);
    expect(newerSnapshot(undefined, fetched)).toBe(fetched);
  });
  it("keeps the current object for an identical version so structural sharing is untouched", () => {
    const current = snap("same", "2026-09-14T05:00:00.000Z");
    expect(newerSnapshot(current, snap("same", "2026-09-14T05:00:00.000Z"))).toBe(current);
  });
  it("accepts the fetched snapshot when either side lacks a timestamp", () => {
    const fetched = snap("v2", "");
    expect(newerSnapshot(snap("v1", "2026-09-14T05:00:00.000Z"), fetched)).toBe(fetched);
    expect(newerSnapshot(snap("v1", ""), snap("v2", "2026-09-14T05:00:00.000Z")).version).toBe("v2");
  });
});

describe("fetchCatalog", () => {
  it("throws on a non-2xx response so TanStack keeps the previous snapshot", async () => {
    globalThis.fetch = vi.fn(async () => new Response("down", { status: 503 })) as typeof fetch;
    await expect(fetchCatalog()).rejects.toThrow(/503/);
  });
});
