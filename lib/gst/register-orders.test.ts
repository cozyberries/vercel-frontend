import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GSTIN, NOW, orderRow } from "./__fixtures__/register";
import {
  fetchCancelledEarlier,
  fetchMissingNumbers,
  fetchMonthInvoices,
  loadSalesRegister,
  REGISTER_COLUMNS,
  REGISTER_RETAILER_COLUMNS,
  toRegisterRow,
} from "./register-orders";
import { monthBounds } from "./register-month";

type Call = [string, unknown[]];
type Response = { data: unknown[] | null; error: { message: string } | null };

/** A Supabase stand-in: each from() is one query that records its calls and resolves to the next response. */
function fakeAdmin(responses: Response[]) {
  const queries: Call[][] = [];
  const admin = {
    from(table: string) {
      const calls: Call[] = [["from", [table]]];
      queries.push(calls);
      const response = responses.shift() ?? { data: [], error: null };
      const builder: object = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "then") return (resolve: (v: Response) => unknown) => resolve(response);
            return (...args: unknown[]) => {
              calls.push([String(prop), args]);
              return builder;
            };
          },
        },
      );
      return builder;
    },
  };
  return { admin: admin as unknown as SupabaseClient, queries };
}

const { start, end } = monthBounds("2026-09");
const S = "2026-08-31T18:30:00.000Z";
const E = "2026-09-30T18:30:00.000Z";

describe("register reads", () => {
  it("never selects phone, email or user id", () => {
    expect(REGISTER_COLUMNS).not.toMatch(/phone|email|user_id/);
    expect(REGISTER_COLUMNS).toContain("invoice_voided_at");
  });

  it("selects only the state and name inside shipping_address, never the whole JSON (it carries the phone)", () => {
    expect(REGISTER_COLUMNS).toContain("ship_state:shipping_address->>state");
    expect(REGISTER_COLUMNS).toContain("ship_name:shipping_address->>full_name");
    expect(REGISTER_COLUMNS.split(",").map((c) => c.trim())).not.toContain("shipping_address");
  });

  it("rebuilds shipping_address from the two selected fields", () => {
    const raw = { ...orderRow(), ship_state: "Karnataka", ship_name: "Ravi" };
    delete (raw as Record<string, unknown>).shipping_address;
    expect(toRegisterRow(raw).shipping_address).toEqual({ state: "Karnataka", full_name: "Ravi" });
    expect(toRegisterRow({ ...orderRow(), ship_state: null, ship_name: null } as never).shipping_address).toBeNull();
    expect("ship_state" in toRegisterRow({ ...orderRow(), ship_state: null, ship_name: null } as never)).toBe(false);
  });

  it("takes the place of supply from the shipping state when the order has none", async () => {
    const raw = { ...orderRow({ fulfilment_method: "delivery", place_of_supply: null }), ship_state: "Karnataka", ship_name: "Ravi" };
    const { admin } = fakeAdmin([{ data: [raw], error: null }]);
    const r = await loadSalesRegister(admin, { month: "2026-09", gstin: GSTIN, now: NOW });
    expect(r.invoices[0].placeOfSupply.code).toBe("29");
  });

  it("reads invoices dated in the month", async () => {
    const { admin, queries } = fakeAdmin([{ data: [orderRow()], error: null }]);
    expect(await fetchMonthInvoices(admin, start, end)).toEqual([orderRow()]);
    expect(queries[0]).toEqual(expect.arrayContaining([
      ["from", ["orders"]],
      ["select", [REGISTER_COLUMNS]],
      ["not", ["invoice_number", "is", null]],
      ["gte", ["invoice_date", S]],
      ["lt", ["invoice_date", E]],
      ["range", [0, 999]],
    ]));
  });

  it("reads earlier invoices voided in the month", async () => {
    const { admin, queries } = fakeAdmin([{ data: [], error: null }]);
    await fetchCancelledEarlier(admin, start, end);
    expect(queries[0]).toEqual(expect.arrayContaining([
      ["not", ["invoice_number", "is", null]],
      ["lt", ["invoice_date", S]],
      ["gte", ["invoice_voided_at", S]],
      ["lt", ["invoice_voided_at", E]],
    ]));
  });

  it("finds paid orders of the month with no invoice number", async () => {
    const { admin, queries } = fakeAdmin([{ data: [{ order_number: "ORD-A" }], error: null }]);
    expect(await fetchMissingNumbers(admin, start, end)).toEqual([{ order_number: "ORD-A" }]);
    expect(queries[0]).toEqual(expect.arrayContaining([
      ["select", ["order_number"]],
      ["is", ["invoice_number", null]],
      ["in", ["status", ["payment_confirmed", "processing", "ready_for_pickup", "collected", "shipped", "delivered"]]],
      ["or", [`and(stock_committed_at.gte.${S},stock_committed_at.lt.${E}),and(stock_committed_at.is.null,created_at.gte.${S},created_at.lt.${E})`]],
    ]));
  });

  it("reads past PostgREST's 1,000-row page", async () => {
    const page = Array.from({ length: 1000 }, (_, i) => orderRow({ id: `o${i}` }));
    const { admin, queries } = fakeAdmin([{ data: page, error: null }, { data: [orderRow({ id: "last" })], error: null }]);
    expect(await fetchMonthInvoices(admin, start, end)).toHaveLength(1001);
    expect(queries[1]).toContainEqual(["range", [1000, 1999]]);
  });

  it("throws the database error", async () => {
    const { admin } = fakeAdmin([{ data: null, error: { message: "boom" } }]);
    await expect(fetchMonthInvoices(admin, start, end)).rejects.toThrow("boom");
  });

  it("loads the three reads into one register", async () => {
    const { admin } = fakeAdmin([
      { data: [orderRow()], error: null },
      { data: [], error: null },
      { data: [{ order_number: "ORD-A" }], error: null },
    ]);
    const r = await loadSalesRegister(admin, { month: "2026-09", gstin: GSTIN, now: NOW });
    expect(r.invoices.map((i) => i.invoiceNumber)).toEqual(["CB/26-27/0001"]);
    expect(r.warnings).toEqual(["Paid orders with no invoice number: ORD-A"]);
  });

  it("never selects a shop's phone, email or contact name", () => {
    expect(REGISTER_RETAILER_COLUMNS).not.toMatch(/phone|email|contact_name/);
  });
});
