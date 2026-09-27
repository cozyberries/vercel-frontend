// Stall refills: what sold today and yesterday (IST), and what staff have put back
// on the shelf. Client-safe: the page imports these types and formatters, so no
// server-only imports belong here.
import type { ListCard } from "@/lib/catalog/types";
import { getVariantUrl } from "@/lib/utils/image";

export type RefillAction = "refilled" | "no_stock";

export interface RefillActionRow {
  id: string;
  action: RefillAction;
  quantity: number;
  acted_by_name: string;
  acted_at: string;
}

/** One row of the stall_refill_lines() Postgres function. */
export interface RefillDbRow {
  sale_date: string;
  variant_slug: string | null;
  product_slug: string | null;
  item_name: string;
  item_size: string | null;
  sold: number;
  stock_now: number | null;
  handled: number;
  actions: RefillActionRow[];
}

export interface RefillLine {
  /** variant_slug, or "unmatched:<product>:<size>" for a sale no stock item matched. */
  key: string;
  variant_slug: string | null;
  name: string;
  size: string | null;
  image: string | null;
  sold: number;
  /** Units still to put back on the shelf: sold − handled, never below 0. */
  pending: number;
  stock_now: number | null;
  actions: RefillActionRow[];
}

export interface RefillDay {
  /** IST calendar date, YYYY-MM-DD. */
  date: string;
  lines: RefillLine[];
}

export interface RefillsResponse {
  today: RefillDay;
  yesterday: RefillDay;
  generated_at: string;
}

export interface RefillInput {
  sale_date: string;
  variant_slug: string;
  action: RefillAction;
  quantity: number;
}

export type ParseResult =
  | { ok: true; value: RefillInput }
  | { ok: false; error: string; code?: "STALE_DATE" };

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const IST_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(format: Intl.DateTimeFormat, date: Date): Record<string, string> {
  return Object.fromEntries(format.formatToParts(date).map((p) => [p.type, p.value]));
}

/** IST calendar date of an instant, YYYY-MM-DD. */
export function istDateString(date: Date): string {
  const p = parts(IST_DATE, date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** IST has no daylight saving, so yesterday is always 24 hours back. */
export function refillDays(now: Date): { today: string; yesterday: string } {
  return { today: istDateString(now), yesterday: istDateString(new Date(now.getTime() - DAY_MS)) };
}

/** "14:30", IST. */
export function formatIstTime(iso: string): string {
  const p = parts(IST_TIME, new Date(iso));
  return `${p.hour}:${p.minute}`;
}

/** "2026-09-27" → "Sun 27 Sep". Built by hand: ICU spells September "Sept" in en-GB/en-IN. */
export function formatSaleDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function lastActedAt(line: RefillLine): string {
  return line.actions[line.actions.length - 1]?.acted_at ?? "";
}

/** To refill first (fewest left first, then name), handled after with the latest on top. */
function compareLines(a: RefillLine, b: RefillLine): number {
  const aOpen = a.pending > 0;
  const bOpen = b.pending > 0;
  if (aOpen !== bOpen) return aOpen ? -1 : 1;
  if (aOpen) {
    const aLeft = a.stock_now ?? Number.POSITIVE_INFINITY;
    const bLeft = b.stock_now ?? Number.POSITIVE_INFINITY;
    if (aLeft !== bLeft) return aLeft - bLeft;
    return `${a.name} ${a.size ?? ""}`.localeCompare(`${b.name} ${b.size ?? ""}`);
  }
  return lastActedAt(b).localeCompare(lastActedAt(a));
}

/** One day's lines: DB rows for that date, named and pictured from the catalog snapshot. */
export function buildRefillDay(rows: RefillDbRow[], products: ListCard[], date: string): RefillDay {
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const lines = rows
    .filter((row) => row.sale_date === date)
    .map((row): RefillLine => {
      const card = row.product_slug ? bySlug.get(row.product_slug) : undefined;
      const photo = card?.images?.[0];
      return {
        key:
          row.variant_slug ??
          `unmatched:${row.product_slug ?? "unknown"}:${(row.item_size ?? "").toLowerCase()}`,
        variant_slug: row.variant_slug,
        name: card?.name ?? row.item_name,
        size: row.item_size,
        image: photo ? getVariantUrl(photo, "thumbnail", "webp") : null,
        sold: row.sold,
        pending: row.variant_slug ? Math.max(row.sold - row.handled, 0) : row.sold,
        stock_now: row.stock_now,
        actions: row.actions ?? [],
      };
    });
  lines.sort(compareLines);
  return { date, lines };
}

/** Validates a POST body. The day must still be today or yesterday in IST. */
export function parseRefillAction(body: unknown, now: Date): ParseResult {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be a JSON object" };
  const { sale_date, variant_slug, action, quantity } = body as Record<string, unknown>;
  if (action !== "refilled" && action !== "no_stock") {
    return { ok: false, error: "action must be 'refilled' or 'no_stock'" };
  }
  if (typeof variant_slug !== "string" || variant_slug.trim() === "" || variant_slug.length > 200) {
    return { ok: false, error: "variant_slug is required" };
  }
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
    return { ok: false, error: "quantity must be a whole number from 1 to 1000" };
  }
  const days = refillDays(now);
  if (typeof sale_date !== "string" || (sale_date !== days.today && sale_date !== days.yesterday)) {
    return { ok: false, error: "sale_date must be today or yesterday", code: "STALE_DATE" };
  }
  return { ok: true, value: { sale_date, variant_slug, action, quantity } };
}

/** Display name stored with a tick. user_metadata is user-editable, so this is never used to authorise. */
export function actedByName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): string {
  const fullName = user.user_metadata?.full_name;
  if (typeof fullName === "string" && fullName.trim()) return fullName.trim().slice(0, 80);
  if (user.email) return user.email;
  return "Admin";
}

/** Maps the errors raised by stall_refill_record / stall_refill_undo to HTTP answers. */
export function refillRpcError(message: string | undefined): { status: number; error: string } {
  const m = message ?? "";
  if (m === "NOTHING_TO_REFILL") return { status: 409, error: "Already handled on another phone" };
  if (m.startsWith("NOT_SOLD:")) return { status: 404, error: "That size did not sell on that day" };
  if (m === "NOT_FOUND") return { status: 404, error: "That tick no longer exists" };
  if (m.startsWith("BAD_ACTION:") || m === "BAD_QUANTITY") return { status: 400, error: "Invalid action" };
  return { status: 500, error: "Could not save" };
}

export function updatedAgo(ms: number): string {
  if (ms < 10_000) return "Updated just now";
  if (ms < 60_000) return `Updated ${Math.floor(ms / 1000)}s ago`;
  return `Updated ${Math.floor(ms / 60_000)} min ago`;
}

/** "Refilled · 14:30 · Asha", "No stock left ×2 · 14:32 · Asha". */
export function actionLabel(a: RefillActionRow): string {
  const what = a.action === "refilled" ? "Refilled" : "No stock left";
  const qty = a.quantity > 1 ? ` ×${a.quantity}` : "";
  return `${what}${qty} · ${formatIstTime(a.acted_at)} · ${a.acted_by_name}`;
}
