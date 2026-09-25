import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOrderVariants } from "./variant-resolver";

function clientReturning(rows: unknown[] | null, error: unknown = null) {
  const inMock = vi.fn().mockResolvedValue({ data: rows, error });
  const select = vi.fn(() => ({ in: inMock }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as SupabaseClient, from, select, inMock };
}

const frockRows = [
  { slug: "frock-3-4y-pink", product_slug: "frock", size_slug: "3-4y", stock_quantity: 2 },
  { slug: "frock-4-5y-pink", product_slug: "frock", size_slug: "4-5y", stock_quantity: 0 },
];

describe("resolveOrderVariants", () => {
  it("maps display sizes to variant slugs case-insensitively", async () => {
    const { client, from, inMock } = clientReturning(frockRows);
    const result = await resolveOrderVariants(client, [{ id: "frock", name: "Frock", price: 500, quantity: 1, size: "3-4Y" }]);
    expect(result).toEqual({ ok: true, skus: ["frock-3-4y-pink"] });
    expect(from).toHaveBeenCalledWith("product_variants");
    expect(inMock).toHaveBeenCalledWith("product_slug", ["frock"]);
  });

  it("rejects a size that no longer exists with 400", async () => {
    const { client } = clientReturning(frockRows);
    const result = await resolveOrderVariants(client, [{ id: "frock", name: "Frock", price: 500, quantity: 1, size: "9-10Y" }]);
    expect(result).toEqual({ ok: false, status: 400, error: "Frock (9-10Y) is no longer available" });
  });

  it("rejects more than the available stock with 409, counting repeated lines together", async () => {
    const { client } = clientReturning(frockRows);
    const result = await resolveOrderVariants(client, [
      { id: "frock", name: "Frock", price: 500, quantity: 1, size: "3-4Y" },
      { id: "frock", name: "Frock", price: 500, quantity: 2, size: "3-4y" },
    ]);
    expect(result).toEqual({ ok: false, status: 409, error: "Only 2 left of Frock (3-4y)" });
  });

  it("says out of stock when nothing is left", async () => {
    const { client } = clientReturning(frockRows);
    const result = await resolveOrderVariants(client, [{ id: "frock", name: "Frock", price: 500, quantity: 1, size: "4-5Y" }]);
    expect(result).toEqual({ ok: false, status: 409, error: "Frock (4-5Y) is out of stock" });
  });

  it("returns 500 when the lookup fails", async () => {
    const { client } = clientReturning(null, { message: "db down" });
    const result = await resolveOrderVariants(client, [{ id: "frock", name: "Frock", price: 500, quantity: 1, size: "3-4Y" }]);
    expect(result).toEqual({ ok: false, status: 500, error: "Failed to check stock" });
  });
});
