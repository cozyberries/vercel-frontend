import { describe, expect, it } from "vitest";
import { fetchActiveVariants, VARIANT_PAGE_SIZE } from "./stock-variants";

type Call = { method: string; args: unknown[] };

/** Records each query's builder calls; the Nth query's .range() resolves to pages[N]. */
function fakeAdmin(pages: unknown[][], error: { message: string } | null = null) {
  const queries: Call[][] = [];
  const from = (table: string) => {
    const calls: Call[] = [{ method: "from", args: [table] }];
    const index = queries.push(calls) - 1;
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order"]) {
      b[m] = (...args: unknown[]) => {
        calls.push({ method: m, args });
        return b;
      };
    }
    b.range = async (...args: unknown[]) => {
      calls.push({ method: "range", args });
      return error ? { data: null, error } : { data: pages[index] ?? [], error: null };
    };
    return b;
  };
  return { admin: { from } as never, queries };
}

const rows = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => ({ slug: `v${offset + i}` }));
const callsOf = (q: Call[], method: string) => q.filter((c) => c.method === method).map((c) => c.args);

describe("fetchActiveVariants", () => {
  it("reads active-product variants with their product, category and size", async () => {
    const { admin, queries } = fakeAdmin([rows(3)]);
    expect(await fetchActiveVariants(admin)).toHaveLength(3);
    const q = queries[0];
    expect(callsOf(q, "from")).toEqual([["product_variants"]]);
    expect(callsOf(q, "select")[0][0]).toBe(
      "slug, product_slug, size_slug, stock_quantity, price, products!inner(name, is_active, category_slug, categories(name)), sizes(name, display_order)",
    );
    expect(callsOf(q, "eq")).toEqual([["products.is_active", true]]);
    expect(callsOf(q, "order")).toEqual([["slug", { ascending: true }]]);
    expect(callsOf(q, "range")).toEqual([[0, VARIANT_PAGE_SIZE - 1]]);
  });

  it("keeps reading pages of 1,000 until a short page", async () => {
    const { admin, queries } = fakeAdmin([rows(1000), rows(5, 1000)]);
    expect(await fetchActiveVariants(admin)).toHaveLength(1005);
    expect(queries.map((q) => callsOf(q, "range")[0])).toEqual([[0, 999], [1000, 1999]]);
  });

  it("throws when Supabase returns an error", async () => {
    const { admin } = fakeAdmin([], { message: "permission denied" });
    await expect(fetchActiveVariants(admin)).rejects.toThrow("permission denied");
  });
});
