import { describe, expect, it } from "vitest";
import { countDashboardActions } from "./dashboard-actions";

/** A minimal PostgREST-style builder that records the filters applied. */
function fakeAdmin(counts: Record<string, number>, collectedRows: { order_id: string }[]) {
  const calls: Record<string, unknown>[] = [];
  const builder = (table: string) => {
    const filters: Record<string, unknown> = { table };
    const b: Record<string, unknown> = {};
    const chain = (k: string) => (...args: unknown[]) => {
      filters[k] = args;
      return b;
    };
    for (const k of ["eq", "in", "is", "gte", "not"]) b[k] = chain(k);
    b.select = (cols: string, opts?: { head?: boolean; count?: string }) => {
      filters.select = cols;
      filters.head = opts?.head ?? false;
      return b;
    };
    b.then = (resolve: (v: unknown) => void) => {
      calls.push(filters);
      if (table === "order_status_events") return resolve({ data: collectedRows, error: null });
      const key = JSON.stringify(filters.in ?? filters.eq);
      return resolve({ count: counts[key] ?? 0, error: null });
    };
    return b;
  };
  return { from: builder, calls };
}

describe("countDashboardActions", () => {
  it("counts each tile and de-duplicates collected events per order", async () => {
    const admin = fakeAdmin(
      {
        [JSON.stringify(["status", ["payment_pending", "verifying_payment"]])]: 3,
        [JSON.stringify(["status", ["payment_confirmed", "processing"]])]: 5,
        [JSON.stringify(["status", "ready_for_pickup"])]: 2,
      },
      [{ order_id: "o1" }, { order_id: "o1" }, { order_id: "o2" }],
    );
    const now = new Date("2026-09-30T06:00:00Z"); // 11:30 IST
    const r = await countDashboardActions(admin as never, now);
    expect(r).toMatchObject({ awaiting: 3, to_ship: 5, ready_for_pickup: 2, collected_today: 2 });
    expect(r.generated_at).toBe(now.toISOString());
    const events = admin.calls.find((c) => c.table === "order_status_events")!;
    expect(events.eq).toEqual(["to_status", "collected"]);
    expect(events.gte).toEqual(["created_at", "2026-09-29T18:30:00.000Z"]);
  });
});
