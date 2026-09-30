import { describe, expect, it } from "vitest";
import { countDashboardActions } from "./dashboard-actions";

type FilterCall = [method: string, ...args: unknown[]];
interface RecordedQuery {
  table: string;
  filters: FilterCall[];
  select?: string;
  head?: boolean;
}

/**
 * A minimal PostgREST-style builder that records every filter call, in order,
 * for each query. The count-lookup key is derived from the *full* ordered
 * filter list so two `.eq()` calls on the same query (e.g. fulfilment_method
 * then status) don't clobber each other.
 */
function fakeAdmin(counts: Record<string, number>, collectedRows: { order_id: string }[]) {
  const calls: RecordedQuery[] = [];
  const builder = (table: string) => {
    const filters: FilterCall[] = [];
    const b: Record<string, unknown> = {};
    const chain = (method: string) => (...args: unknown[]) => {
      filters.push([method, ...args]);
      return b;
    };
    for (const k of ["eq", "in", "is", "gte", "not"]) b[k] = chain(k);
    let select: string | undefined;
    let head = false;
    b.select = (cols: string, opts?: { head?: boolean; count?: string }) => {
      select = cols;
      head = opts?.head ?? false;
      return b;
    };
    b.then = (resolve: (v: unknown) => void) => {
      calls.push({ table, filters, select, head });
      if (table === "order_status_events") return resolve({ data: collectedRows, error: null });
      const key = JSON.stringify(filters);
      return resolve({ count: counts[key] ?? 0, error: null });
    };
    return b;
  };
  return { from: builder, calls };
}

const TO_SHIP_FILTERS: FilterCall[] = [
  ["eq", "fulfilment_method", "delivery"],
  ["in", "status", ["payment_confirmed", "processing"]],
  ["is", "tracking_number", null],
];
const AWAITING_FILTERS: FilterCall[] = [
  ["eq", "fulfilment_method", "pickup"],
  ["in", "status", ["payment_pending", "verifying_payment"]],
];
const READY_FILTERS: FilterCall[] = [
  ["eq", "fulfilment_method", "pickup"],
  ["eq", "status", "ready_for_pickup"],
];

describe("countDashboardActions", () => {
  it("counts each tile and de-duplicates collected events per order", async () => {
    const admin = fakeAdmin(
      {
        [JSON.stringify(AWAITING_FILTERS)]: 3,
        [JSON.stringify(TO_SHIP_FILTERS)]: 5,
        [JSON.stringify(READY_FILTERS)]: 2,
      },
      [{ order_id: "o1" }, { order_id: "o1" }, { order_id: "o2" }],
    );
    const now = new Date("2026-09-30T06:00:00Z"); // 11:30 IST
    const r = await countDashboardActions(admin as never, now);
    expect(r).toMatchObject({ awaiting: 3, to_ship: 5, ready_for_pickup: 2, collected_today: 2 });
    expect(r.generated_at).toBe(now.toISOString());

    const events = admin.calls.find((c) => c.table === "order_status_events")!;
    expect(events.filters).toContainEqual(["eq", "to_status", "collected"]);
    expect(events.filters).toContainEqual(["gte", "created_at", "2026-09-29T18:30:00.000Z"]);

    // Both to_ship and ready query "orders", so identify each by a filter that
    // is unique to it rather than by call order.
    const toShip = admin.calls.find((c) =>
      c.filters.some((f) => f[0] === "eq" && f[1] === "fulfilment_method" && f[2] === "delivery"),
    )!;
    expect(toShip.filters).toContainEqual(["eq", "fulfilment_method", "delivery"]);
    expect(toShip.filters).toContainEqual(["in", "status", ["payment_confirmed", "processing"]]);
    expect(toShip.filters).toContainEqual(["is", "tracking_number", null]);

    const ready = admin.calls.find((c) =>
      c.filters.some((f) => f[0] === "eq" && f[1] === "status" && f[2] === "ready_for_pickup"),
    )!;
    expect(ready.filters).toContainEqual(["eq", "fulfilment_method", "pickup"]);
    expect(ready.filters).toContainEqual(["eq", "status", "ready_for_pickup"]);
  });

  it("counts only pickup orders as awaiting ✅, matching the pickup tab the tile opens", async () => {
    const admin = fakeAdmin({ [JSON.stringify(AWAITING_FILTERS)]: 4 }, []);
    const r = await countDashboardActions(admin as never, new Date("2026-09-30T06:00:00Z"));
    expect(r.awaiting).toBe(4);
    const awaiting = admin.calls.find((c) =>
      c.filters.some((f) => f[0] === "in" && f[1] === "status" && JSON.stringify(f[2]) === JSON.stringify(["payment_pending", "verifying_payment"])),
    )!;
    expect(awaiting.table).toBe("orders");
    expect(awaiting.head).toBe(true);
    expect(awaiting.filters).toContainEqual(["eq", "fulfilment_method", "pickup"]);
    expect(awaiting.filters).toContainEqual(["in", "status", ["payment_pending", "verifying_payment"]]);
  });
});
