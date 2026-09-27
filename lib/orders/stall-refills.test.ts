import { describe, expect, it } from "vitest";
import type { ListCard } from "@/lib/catalog/types";
import {
  actedByName,
  actionLabel,
  buildRefillDay,
  formatIstTime,
  formatSaleDay,
  istDateString,
  parseRefillAction,
  refillDays,
  refillRpcError,
  updatedAgo,
  type RefillDbRow,
} from "./stall-refills";

const PHOTO =
  "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/public/media/products/frock-moon/1.jpg";
const card = (slug: string, name: string, images: string[] = []) =>
  ({ slug, name, images }) as unknown as ListCard;
const row = (over: Partial<RefillDbRow> = {}): RefillDbRow => ({
  sale_date: "2026-09-27",
  variant_slug: "frock-moon-0-3m",
  product_slug: "frock-moon",
  item_name: "Moon frock (as billed)",
  item_size: "0-3M",
  sold: 1,
  stock_now: 4,
  handled: 0,
  actions: [],
  ...over,
});
const tick = (acted_at: string) => ({
  id: acted_at,
  action: "refilled" as const,
  quantity: 1,
  acted_by_name: "Asha",
  acted_at,
});

describe("IST days", () => {
  it("rolls over at IST midnight, not UTC midnight", () => {
    expect(istDateString(new Date("2026-09-26T18:29:00Z"))).toBe("2026-09-26"); // 23:59 IST
    expect(istDateString(new Date("2026-09-26T18:31:00Z"))).toBe("2026-09-27"); // 00:01 IST
  });

  it("gives today and yesterday in IST", () => {
    expect(refillDays(new Date("2026-09-26T18:31:00Z"))).toEqual({
      today: "2026-09-27",
      yesterday: "2026-09-26",
    });
  });

  it("formats times and days for the page", () => {
    expect(formatIstTime("2026-09-27T09:00:00.000Z")).toBe("14:30");
    expect(formatIstTime("2026-09-26T18:35:00.000Z")).toBe("00:05");
    expect(formatSaleDay("2026-09-27")).toBe("Sun 27 Sep");
    expect(formatSaleDay("2026-09-26")).toBe("Sat 26 Sep");
  });
});

describe("buildRefillDay", () => {
  it("keeps only that day's rows", () => {
    const day = buildRefillDay(
      [row({ sale_date: "2026-09-26", variant_slug: "a" }), row({ variant_slug: "b" })],
      [],
      "2026-09-27",
    );
    expect(day).toMatchObject({ date: "2026-09-27", lines: [{ key: "b" }] });
  });

  it("uses the catalog name and the thumbnail photo", () => {
    const day = buildRefillDay(
      [row()],
      [card("frock-moon", "Moon and Stars - Sleeveless Muslin Cotton Frock", [PHOTO])],
      "2026-09-27",
    );
    expect(day.lines[0]).toMatchObject({
      key: "frock-moon-0-3m",
      name: "Moon and Stars - Sleeveless Muslin Cotton Frock",
      size: "0-3M",
      image: PHOTO.replace("1.jpg", "1_thumbnail.webp"),
    });
  });

  it("falls back to the order item's name with no photo when the product is not in the catalog", () => {
    const day = buildRefillDay([row()], [], "2026-09-27");
    expect(day.lines[0]).toMatchObject({ name: "Moon frock (as billed)", image: null });
  });

  it("pending is units sold minus units already handled", () => {
    const day = buildRefillDay([row({ sold: 3, handled: 2 })], [], "2026-09-27");
    expect(day.lines[0].pending).toBe(1);
  });

  it("never goes below zero when a paid order was cancelled after its units were ticked", () => {
    const day = buildRefillDay([row({ sold: 1, handled: 2 })], [], "2026-09-27");
    expect(day.lines[0].pending).toBe(0);
  });

  it("a sale no stock item matched stays open with its own key", () => {
    const day = buildRefillDay(
      [row({ variant_slug: null, product_slug: "old-frock", item_size: "2-3Y", stock_now: null })],
      [],
      "2026-09-27",
    );
    expect(day.lines[0]).toMatchObject({ key: "unmatched:old-frock:2-3y", variant_slug: null, pending: 1 });
  });

  it("puts lines to refill first (fewest left first), then handled lines, latest first", () => {
    const day = buildRefillDay(
      [
        row({ variant_slug: "open-3", item_name: "B frock", stock_now: 3 }),
        row({ variant_slug: "open-1", item_name: "Z frock", stock_now: 1 }),
        row({ variant_slug: null, product_slug: "no-stock-item", item_name: "A frock", stock_now: null }),
        row({ variant_slug: "done-early", handled: 1, actions: [tick("2026-09-27T03:30:00.000Z")] }),
        row({ variant_slug: "done-late", handled: 1, actions: [tick("2026-09-27T04:30:00.000Z")] }),
      ],
      [],
      "2026-09-27",
    );
    expect(day.lines.map((l) => l.key)).toEqual([
      "open-1",
      "open-3",
      "unmatched:no-stock-item:0-3m",
      "done-late",
      "done-early",
    ]);
  });
});

describe("parseRefillAction", () => {
  const now = new Date("2026-09-27T06:00:00Z");
  const valid = { sale_date: "2026-09-27", variant_slug: "frock-moon-0-3m", action: "refilled", quantity: 3 };

  it("accepts a tick for today or yesterday", () => {
    expect(parseRefillAction(valid, now)).toEqual({ ok: true, value: valid });
    expect(parseRefillAction({ ...valid, sale_date: "2026-09-26", action: "no_stock" }, now)).toMatchObject({
      ok: true,
    });
  });

  it("rejects bodies that are not a tick", () => {
    expect(parseRefillAction(null, now)).toMatchObject({ ok: false });
    expect(parseRefillAction({ ...valid, action: "restocked" }, now)).toMatchObject({ ok: false });
    expect(parseRefillAction({ ...valid, variant_slug: " " }, now)).toMatchObject({ ok: false });
    expect(parseRefillAction({ ...valid, quantity: 0 }, now)).toMatchObject({ ok: false });
    expect(parseRefillAction({ ...valid, quantity: 1.5 }, now)).toMatchObject({ ok: false });
    expect(parseRefillAction({ ...valid, quantity: "2" }, now)).toMatchObject({ ok: false });
  });

  it("flags a day older than yesterday as a stale list", () => {
    expect(parseRefillAction({ ...valid, sale_date: "2026-09-25" }, now)).toEqual({
      ok: false,
      error: "sale_date must be today or yesterday",
      code: "STALE_DATE",
    });
  });
});

describe("small helpers", () => {
  it("names who acted: full name, else email, else Admin", () => {
    expect(actedByName({ email: "a@x.in", user_metadata: { full_name: "  Asha  " } })).toBe("Asha");
    expect(actedByName({ email: "a@x.in", user_metadata: {} })).toBe("a@x.in");
    expect(actedByName({ email: null, user_metadata: null })).toBe("Admin");
  });

  it("maps database errors to HTTP answers", () => {
    expect(refillRpcError("NOTHING_TO_REFILL")).toEqual({ status: 409, error: "Already handled on another phone" });
    expect(refillRpcError("NOT_SOLD:frock-moon-0-3m").status).toBe(404);
    expect(refillRpcError("NOT_FOUND").status).toBe(404);
    expect(refillRpcError("BAD_ACTION:restocked").status).toBe(400);
    expect(refillRpcError("connection reset").status).toBe(500);
    expect(refillRpcError(undefined).status).toBe(500);
  });

  it("says how fresh the list is", () => {
    expect(updatedAgo(-500)).toBe("Updated just now");
    expect(updatedAgo(5_000)).toBe("Updated just now");
    expect(updatedAgo(12_000)).toBe("Updated 12s ago");
    expect(updatedAgo(185_000)).toBe("Updated 3 min ago");
  });

  it("labels a tick with what, when and who", () => {
    expect(actionLabel(tick("2026-09-27T09:00:00.000Z"))).toBe("Refilled · 14:30 · Asha");
    expect(
      actionLabel({ ...tick("2026-09-27T09:02:00.000Z"), action: "no_stock", quantity: 2 }),
    ).toBe("No stock left ×2 · 14:32 · Asha");
  });
});
