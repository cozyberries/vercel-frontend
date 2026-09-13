import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildProductDoc, buildReference, buildSnapshot, computeRatingSummaries, toListCard } from "./build";
import { frockRow, productRows, ratingRows, referenceRows } from "./__fixtures__/catalog-rows";
import type { Snapshot } from "./types";

const reference = buildReference(referenceRows);
const docs = productRows.map((row) => buildProductDoc(row, { reference, ratings: computeRatingSummaries(ratingRows) }));
const snapshot: Snapshot = buildSnapshot(docs.map(toListCard), reference, null, new Date("2026-09-13T00:00:00Z")).snapshot;

const getRanking = vi.fn(async (): Promise<string[] | null> => null);
vi.mock("./cache", () => ({
  getSnapshot: async () => ({ snapshot, source: "redis" }),
  getProduct: async (slug: string) => ({ product: docs.find((d) => d.slug === slug) ?? null, source: "redis" }),
  getRanking: (...args: unknown[]) => getRanking(...(args as [])),
}));

import { categoriesResponse, optionsFromSnapshot, productDetailResponse, productsListResponse, searchResponse, suggestionsResponse } from "./http";

describe("productsListResponse", () => {
  beforeEach(() => getRanking.mockReset().mockResolvedValue(null));

  it("keeps the legacy contract and headers", async () => {
    const res = await productsListResponse(new URLSearchParams("limit=2&page=1&category=frocks"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache-Status")).toBe("HIT");
    expect(res.headers.get("X-Catalog-Version")).toBe(snapshot.version);
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=60, stale-while-revalidate=300");
    const body = (await res.json()) as { products: Array<{ id: string; colors: string[] }>; pagination: Record<string, unknown> };
    expect(body.products.map((p) => p.id)).toEqual([frockRow.slug]);
    expect(body.products[0]?.colors).toEqual(["soft-pear"]);
    expect(body.pagination).toEqual({ currentPage: 1, totalPages: 1, totalItems: 1, itemsPerPage: 2, hasNextPage: false, hasPrevPage: false });
  });

  it("validates limit and page like the legacy route", async () => {
    expect((await productsListResponse(new URLSearchParams("limit=0"))).status).toBe(400);
    expect((await productsListResponse(new URLSearchParams("limit=101"))).status).toBe(400);
    expect((await productsListResponse(new URLSearchParams("page=0"))).status).toBe(400);
  });

  it("uses the server ranking for searches", async () => {
    getRanking.mockResolvedValue([frockRow.slug]);
    const res = await productsListResponse(new URLSearchParams("search=frock"));
    const body = (await res.json()) as { products: Array<{ id: string }> };
    expect(body.products.map((p) => p.id)).toEqual([frockRow.slug]);
    expect(getRanking).toHaveBeenCalledWith("frock", expect.objectContaining({ search: "frock" }));
  });
});

describe("productDetailResponse", () => {
  it("returns the document or 404", async () => {
    const res = await productDetailResponse(frockRow.slug);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { slug: string }).slug).toBe(frockRow.slug);
    expect((await productDetailResponse("nope")).status).toBe(404);
  });
});

describe("options and categories", () => {
  it("reproduces the legacy option shapes", () => {
    expect(optionsFromSnapshot("categories", snapshot)).toEqual([
      { id: "boys-coord-sets", name: "Boys Coord Sets", slug: "boys-coord-sets" },
      { id: "frocks", name: "Frocks", slug: "frocks" },
      { id: "jhabla", name: "Jhabla", slug: "jhabla" },
    ]);
    expect(optionsFromSnapshot("genders", snapshot)).toEqual([
      { id: "unisex", name: "Unisex", display_order: 1 },
      { id: "girl", name: "Girls", display_order: 2 },
      { id: "boy", name: "Boys", display_order: 3 },
    ]);
    expect((optionsFromSnapshot("sizes", snapshot) as Array<{ id: string }>)[0]).toEqual({ id: "0-3m", slug: "0-3m", name: "0-3M", display_order: 1 });
    expect((optionsFromSnapshot("ages", snapshot) as Array<{ slug: string }>).map((o) => o.slug)).toEqual(["0-3m", "3-6m", "3-4y", "4-5y", "5-6y"]);
  });

  it("returns the legacy /api/categories shape", async () => {
    const res = await categoriesResponse();
    const body = (await res.json()) as Array<{ id: string; images: unknown[]; display: boolean }>;
    expect(body[1]).toMatchObject({ id: "frocks", slug: "frocks", name: "Frocks", display: true, images: [{ url: "https://img/frocks.jpg", is_primary: true, display_order: 0 }] });
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=300, stale-while-revalidate=3600");
  });
});

describe("search and suggestions", () => {
  beforeEach(() => getRanking.mockReset().mockResolvedValue(null));

  it("returns ranked slugs and null when unavailable", async () => {
    getRanking.mockResolvedValue([frockRow.slug]);
    const ok = (await (await searchResponse(new URLSearchParams("q=frock&gender=girl"))).json()) as { q: string; slugs: string[] | null; version: string };
    expect(ok).toEqual({ version: snapshot.version, q: "frock", slugs: [frockRow.slug] });
    expect(getRanking).toHaveBeenCalledWith("frock", expect.objectContaining({ gender: "girl" }));
    const short = (await (await searchResponse(new URLSearchParams("q=f"))).json()) as { slugs: string[] | null };
    expect(short.slugs).toBeNull();
  });

  it("builds product, category and gender suggestions", async () => {
    getRanking.mockResolvedValue([frockRow.slug]);
    const body = (await (await suggestionsResponse("fro")).json()) as { suggestions: Array<{ id: string; type: string }> };
    expect(body.suggestions.map((s) => s.id)).toEqual([`product:${frockRow.slug}`, "category:frocks"]);
    const gender = (await (await suggestionsResponse("gir")).json()) as { suggestions: Array<{ id: string }> };
    expect(gender.suggestions.some((s) => s.id === "gender:girl")).toBe(true);
    expect(((await (await suggestionsResponse("x")).json()) as { suggestions: unknown[] }).suggestions).toEqual([]);
  });
});
