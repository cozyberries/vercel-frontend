import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FILTERS } from "@/lib/catalog/filter";
import { fetchCatalog, fetchRanking } from "./useCatalog";

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

describe("fetchCatalog", () => {
  it("throws on a non-2xx response so TanStack keeps the previous snapshot", async () => {
    globalThis.fetch = vi.fn(async () => new Response("down", { status: 503 })) as typeof fetch;
    await expect(fetchCatalog()).rejects.toThrow(/503/);
  });
});
