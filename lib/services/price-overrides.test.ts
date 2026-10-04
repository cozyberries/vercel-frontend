import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPriceOverrides, fetchPriceRaise, priceRaiseFrom } from "./price-overrides";

const row = {
  order_id: "o-1", mode: "percent_up", percent: "10.0", amount: "245.00", catalogue_subtotal: "2447.00",
  reason: "Event price", admin_id: "admin-1", admin_email: "asha@cozyberries.in", created_at: "2026-10-04T08:00:00Z",
};

function fakeClient(result: { data: unknown; error: unknown } | Error) {
  const calls: unknown[][] = [];
  const client = {
    from: (table: string) => ({
      select: (cols: string) => ({
        in: async (col: string, ids: string[]) => {
          calls.push([table, cols, col, ids]);
          if (result instanceof Error) throw result;
          return result;
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("fetchPriceOverrides", () => {
  it("returns the rows keyed by order id, with numbers as numbers", async () => {
    const { client, calls } = fakeClient({ data: [row], error: null });
    const map = await fetchPriceOverrides(client, ["o-1", "o-2"]);
    expect(calls[0][0]).toBe("order_price_overrides");
    expect(calls[0][3]).toEqual(["o-1", "o-2"]);
    expect(map.get("o-1")).toEqual({ ...row, percent: 10, amount: 245, catalogue_subtotal: 2447 });
    expect(map.has("o-2")).toBe(false);
  });

  it("skips the query for no orders", async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    expect((await fetchPriceOverrides(client, [])).size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("logs and returns an empty map when the lookup errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient({ data: null, error: { message: "relation does not exist" } });
    expect((await fetchPriceOverrides(client, ["o-1"])).size).toBe(0);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("logs and returns an empty map when the lookup throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient(new Error("network down"));
    expect((await fetchPriceOverrides(client, ["o-1"])).size).toBe(0);
    spy.mockRestore();
  });
});

describe("priceRaiseFrom", () => {
  it("gives the percent and amount of a raise", () => {
    expect(priceRaiseFrom({ mode: "percent_up", percent: 10, amount: 245 })).toEqual({ percent: 10, amount: 245 });
    expect(priceRaiseFrom({ mode: "percent_up", percent: 50, amount: null })).toEqual({ percent: 50, amount: null });
  });

  it("is null for a discount or no record", () => {
    expect(priceRaiseFrom({ mode: "percent_off", percent: 10, amount: 245 })).toBeNull();
    expect(priceRaiseFrom({ mode: "amount", percent: null, amount: 250 })).toBeNull();
    expect(priceRaiseFrom(null)).toBeNull();
  });
});

describe("fetchPriceRaise", () => {
  it("looks up one order", async () => {
    const { client } = fakeClient({ data: [row], error: null });
    expect(await fetchPriceRaise(client, "o-1")).toEqual({ percent: 10, amount: 245 });
  });
});
