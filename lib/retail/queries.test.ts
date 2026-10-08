import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { balance, doc, payment, retailer } from "./__fixtures__/retail";
import { loadRetailerDetail, loadRetailerList, shopName } from "./queries";

type Response = { data: unknown; error: { message: string } | null };

/** A Supabase stand-in: answers by table name, records every query's calls. */
function fakeAdmin(byTable: Record<string, Response>) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = [];
  const admin = {
    from(table: string) {
      const entry = { table, ops: [] as [string, unknown[]][] };
      calls.push(entry);
      const response = byTable[table] ?? { data: [], error: null };
      const builder: object = new Proxy({}, {
        get(_t, prop) {
          if (prop === "then") return (resolve: (v: Response) => unknown) => resolve(response);
          return (...args: unknown[]) => {
            entry.ops.push([String(prop), args]);
            return builder;
          };
        },
      });
      return builder;
    },
  };
  return { admin: admin as unknown as SupabaseClient, calls };
}

const NOW = new Date("2026-11-08T06:00:00Z");

describe("retail loaders", () => {
  it("names a shop by trade name, else legal name", () => {
    expect(shopName(retailer())).toBe("Kids Corner");
    expect(shopName(retailer({ trade_name: null }))).toBe("Kids Corner LLP");
  });

  it("lists shops with summaries and flags a missing report for last month", async () => {
    const other = retailer({ id: "22222222-2222-4222-8222-222222222222", legal_name: "Tiny Toes", trade_name: null, gstin: "33AAACR5055K1ZE", state_code: "33" });
    const { admin } = fakeAdmin({
      retailers: { data: [retailer(), other], error: null },
      retailer_batch_balances: { data: [balance(), balance({ retailer_id: other.id, batch_line_id: "x", sent_on: "2026-09-01" })], error: null },
      consignment_docs: { data: [doc()], error: null },
      retailer_payments: { data: [payment()], error: null },
    });
    const r = await loadRetailerList(admin, NOW);
    expect(r.lastPeriod).toBe("2026-10");
    expect(r.today).toBe("2026-11-08");
    expect(r.items.map((i) => [i.retailer.legal_name, i.summary.unitsHeld, i.summary.owedPaise])).toEqual([
      ["Kids Corner LLP", 3, 25000],
      ["Tiny Toes", 3, 0],
    ]);
    expect(r.missingLastPeriod).toEqual(["Tiny Toes"]);
  });

  it("loads one shop with holdings, or null when it does not exist", async () => {
    const { admin, calls } = fakeAdmin({
      retailers: { data: retailer(), error: null },
      retailer_batch_balances: { data: [balance()], error: null },
      consignment_docs: { data: [doc()], error: null },
      retailer_payments: { data: [], error: null },
    });
    const d = await loadRetailerDetail(admin, retailer().id, NOW);
    expect(d?.holdings.map((h) => h.held)).toEqual([3]);
    expect(d?.summary.invoicedPaise).toBe(75000);
    expect(calls.find((c) => c.table === "consignment_docs")?.ops).toContainEqual(["eq", ["retailer_id", retailer().id]]);

    const missing = fakeAdmin({ retailers: { data: null, error: null } });
    expect(await loadRetailerDetail(missing.admin, retailer().id, NOW)).toBeNull();
  });

  it("throws when a read fails", async () => {
    const { admin } = fakeAdmin({ retailers: { data: null, error: { message: "boom" } } });
    await expect(loadRetailerList(admin, NOW)).rejects.toThrow("boom");
  });
});
