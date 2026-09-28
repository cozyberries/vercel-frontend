import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => {
  const state = {
    claimed: [] as Row[],
    order: null as Row | null,
    notifications: [] as Row[],
    eventUpdates: [] as { patch: Row; id: unknown }[],
    notifError: null as { message: string } | null,
  };
  const admin = {
    rpc: vi.fn(async () => ({ data: state.claimed, error: null })),
    from: vi.fn((table: string) => {
      if (table === "orders")
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: state.order, error: null }) }),
          }),
        };
      if (table === "notifications")
        return {
          insert: async (row: Row) => {
            if (state.notifError) return { error: state.notifError };
            state.notifications.push(row);
            return { error: null };
          },
        };
      if (table === "webhook_events")
        return {
          update: (patch: Row) => ({
            eq: async (_col: string, id: unknown) => {
              state.eventUpdates.push({ patch, id });
              return { error: null };
            },
          }),
        };
      throw new Error(`unexpected table ${table}`);
    }),
  };
  return {
    state,
    admin,
    reset: () => {
      state.claimed = [];
      state.order = null;
      state.notifications = [];
      state.eventUpdates = [];
      state.notifError = null;
    },
  };
});

vi.mock("@/lib/supabase-server", () => ({ createAdminSupabaseClient: () => h.admin }));

import { processWebhookEventBatch } from "./webhook-processor";

const SCAN = { AWB: "AWB1", Status: "Delivered", StatusDateTime: "2026-09-28T10:00:00+05:30", StatusLocation: "Bangalore" };
const event = (over: Row = {}): Row => ({
  id: "ev-1",
  payload: SCAN,
  attempt_count: 0,
  ...over,
});

beforeEach(() => h.reset());

describe("processWebhookEventBatch", () => {
  it("inserts a broadcast notification and marks the event processed", async () => {
    h.state.claimed = [event()];
    h.state.order = { id: "o-1", order_number: "ORD-1", user_id: "u-1" };
    const r = await processWebhookEventBatch();
    expect(r).toEqual({ claimed: 1, processed: 1, failed: 0, skipped: 0 });
    expect(h.state.notifications).toHaveLength(1);
    expect(h.state.notifications[0]).toMatchObject({
      user_id: null,
      type: "shipping_scan",
      read: false,
      title: "Shipment scan: Delivered",
    });
    const meta = h.state.notifications[0].meta as Row;
    expect(meta).toMatchObject({ awb: "AWB1", scan_status: "Delivered", order_id: "o-1", order_number: "ORD-1" });
    const done = h.state.eventUpdates.at(-1)!;
    expect(done.id).toBe("ev-1");
    expect(done.patch).toMatchObject({ status: "processed", last_error: null });
  });

  it("keeps an unmatched AWB as a processed event with a WARN in last_error", async () => {
    h.state.claimed = [event()];
    h.state.order = null;
    await processWebhookEventBatch();
    expect(h.state.notifications[0].message).toContain("AWB AWB1");
    expect(h.state.eventUpdates.at(-1)!.patch.last_error).toContain("WARN_UNMATCHED_AWB:AWB1");
  });

  it("marks a scan-less payload processed and counts it skipped", async () => {
    h.state.claimed = [event({ payload: { nothing: true } })];
    const r = await processWebhookEventBatch();
    expect(r).toEqual({ claimed: 1, processed: 1, failed: 0, skipped: 1 });
    expect(h.state.notifications).toHaveLength(0);
  });

  it("schedules a retry on failure and dead-letters at 10 attempts", async () => {
    h.state.notifError = { message: "insert failed" };
    h.state.claimed = [event(), event({ id: "ev-2", attempt_count: 9 })];
    const r = await processWebhookEventBatch();
    expect(r.failed).toBe(2);
    const [first, second] = h.state.eventUpdates.map((u) => u.patch);
    expect(first).toMatchObject({ status: "pending", attempt_count: 1 });
    expect(first.next_retry_at).toBeTruthy();
    expect(second).toMatchObject({ status: "failed", attempt_count: 10, next_retry_at: null });
  });
});
