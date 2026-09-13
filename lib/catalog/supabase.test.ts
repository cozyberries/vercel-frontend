import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase, type FakeResolver } from "./testing/fake-supabase";

let fake: FakeSupabase;
vi.mock("@/lib/supabase-server", () => ({
  createPublicSupabaseClient: () => fake,
}));

import { catalogDb, PRODUCT_DOC_SELECT } from "./supabase";

function rows(n: number, offset = 0) {
  return Array.from({ length: n }, (_, i) => ({ slug: `p-${offset + i}` }));
}

describe("catalogDb", () => {
  beforeEach(() => {
    fake = new FakeSupabase(() => ({ data: [], error: null }));
  });

  it("fetches specific products by slug with the document select", async () => {
    const resolver: FakeResolver = (table, calls) => {
      expect(table).toBe("products");
      expect(calls[0]).toEqual(["select", [PRODUCT_DOC_SELECT]]);
      expect(calls[1]).toEqual(["in", ["slug", ["a", "b"]]]);
      return { data: rows(2), error: null };
    };
    fake = new FakeSupabase(resolver);
    const result = await catalogDb.fetchProductRows(["a", "b"]);
    expect(result).toHaveLength(2);
    expect(await catalogDb.fetchProductRows([])).toEqual([]);
  });

  it("pages through all products in blocks of 100", async () => {
    const ranges: unknown[] = [];
    fake = new FakeSupabase((_table, calls) => {
      const range = calls.find(([m]) => m === "range")?.[1] as [number, number];
      ranges.push(range);
      return { data: range[0] === 0 ? rows(100) : rows(3, 100), error: null };
    });
    const result = await catalogDb.fetchProductRows();
    expect(result).toHaveLength(103);
    expect(ranges).toEqual([[0, 99], [100, 199]]);
  });

  it("throws a labelled error when Supabase fails", async () => {
    fake = new FakeSupabase(() => ({ data: null, error: { message: "boom" } }));
    await expect(catalogDb.fetchAllProductSlugs()).rejects.toThrow(/product slugs: boom/);
  });

  it("fetches the four reference tables", async () => {
    const tables: string[] = [];
    fake = new FakeSupabase((table) => {
      tables.push(table);
      return { data: [{ slug: `${table}-1` }], error: null };
    });
    const ref = await catalogDb.fetchReferenceRows();
    expect(tables.sort()).toEqual(["categories", "colors", "genders", "sizes"]);
    expect(ref.sizes).toEqual([{ slug: "sizes-1" }]);
  });

  it("scopes rating rows and resolves ids to slugs", async () => {
    fake = new FakeSupabase((table, calls) => {
      if (table === "ratings") {
        expect(calls).toContainEqual(["in", ["product_slug", ["a"]]]);
        return { data: [{ product_slug: "a", rating: 5 }], error: null };
      }
      return { data: { slug: "resolved" }, error: null };
    });
    expect(await catalogDb.fetchRatingRows(["a"])).toEqual([{ product_slug: "a", rating: 5 }]);
    expect(await catalogDb.resolveProductSlugById("123")).toBe("resolved");
    fake = new FakeSupabase(() => ({ data: null, error: { message: "column id does not exist" } }));
    expect(await catalogDb.resolveProductSlugById("123")).toBeNull();
  });
});
