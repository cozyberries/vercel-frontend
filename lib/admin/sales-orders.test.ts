import { describe, expect, it } from "vitest";
import { fetchPaidOrders, SALES_PAGE_SIZE } from "./sales-orders";

type Call = { method: string; args: unknown[] };

/** Records each query's builder calls; the Nth query's .range() resolves to pages[N]. */
function fakeAdmin(pages: unknown[][], error: { message: string } | null = null) {
  const queries: Call[][] = [];
  const from = (table: string) => {
    const calls: Call[] = [{ method: "from", args: [table] }];
    const index = queries.push(calls) - 1;
    const b: Record<string, unknown> = {};
    for (const m of ["select", "in", "or", "order"]) {
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

const rows = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => ({ id: `o${offset + i}` }));
const callsOf = (q: Call[], method: string) => q.filter((c) => c.method === method).map((c) => c.args);

describe("fetchPaidOrders", () => {
  it("reads paid orders with their lines, from the start of the sale-date window", async () => {
    const { admin, queries } = fakeAdmin([rows(3)]);
    const out = await fetchPaidOrders(admin, new Date("2026-08-03T18:30:00.000Z"));
    expect(out).toHaveLength(3);
    expect(queries).toHaveLength(1);
    const q = queries[0];
    expect(callsOf(q, "from")).toEqual([["orders"]]);
    expect(callsOf(q, "select")[0][0]).toBe(
      "id, total_amount, fulfilment_method, status, created_at, stock_committed_at, order_items(product_id, name, price, quantity)",
    );
    expect(callsOf(q, "in")).toEqual([
      ["status", ["payment_confirmed", "processing", "ready_for_pickup", "collected", "shipped", "delivered"]],
    ]);
    expect(callsOf(q, "or")).toEqual([
      ["stock_committed_at.gte.2026-08-03T18:30:00.000Z,and(stock_committed_at.is.null,created_at.gte.2026-08-03T18:30:00.000Z)"],
    ]);
    expect(callsOf(q, "range")).toEqual([[0, SALES_PAGE_SIZE - 1]]);
  });

  it("reads everything for All time", async () => {
    const { admin, queries } = fakeAdmin([rows(2)]);
    await fetchPaidOrders(admin, null);
    expect(callsOf(queries[0], "or")).toEqual([]);
  });

  it("keeps reading pages of 1,000 until a short page", async () => {
    const { admin, queries } = fakeAdmin([rows(1000), rows(5, 1000)]);
    const out = await fetchPaidOrders(admin, null);
    expect(out).toHaveLength(1005);
    expect(queries.map((q) => callsOf(q, "range")[0])).toEqual([[0, 999], [1000, 1999]]);
  });

  it("stops after an empty page when the total is an exact multiple of 1,000", async () => {
    const { admin, queries } = fakeAdmin([rows(1000), []]);
    expect(await fetchPaidOrders(admin, null)).toHaveLength(1000);
    expect(queries).toHaveLength(2);
  });

  it("orders pages by created_at then id so paging is stable", async () => {
    const { admin, queries } = fakeAdmin([rows(1)]);
    await fetchPaidOrders(admin, null);
    expect(callsOf(queries[0], "order")).toEqual([
      ["created_at", { ascending: true }],
      ["id", { ascending: true }],
    ]);
  });

  it("throws when Supabase returns an error", async () => {
    const { admin } = fakeAdmin([], { message: "permission denied" });
    await expect(fetchPaidOrders(admin, null)).rejects.toThrow("permission denied");
  });
});
