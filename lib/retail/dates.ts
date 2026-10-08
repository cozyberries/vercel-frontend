import { istParts } from "@/lib/admin/sales-range";

const pad = (n: number) => String(n).padStart(2, "0");
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Today's IST calendar date, YYYY-MM-DD. */
export function istToday(now: Date): string {
  const { y, m, day } = istParts(now);
  return `${y}-${pad(m + 1)}-${pad(day)}`;
}

/** The current IST month, YYYY-MM. */
export function currentPeriod(now: Date): string {
  return istToday(now).slice(0, 7);
}

export function isPeriod(v: unknown): v is string {
  return typeof v === "string" && PERIOD_RE.test(v);
}

/** A real calendar date written YYYY-MM-DD. */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const match = DATE_RE.exec(v);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** The last `count` months, newest first, starting with the current IST month. */
export function recentPeriods(now: Date, count: number): string[] {
  const { y, m } = istParts(now);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - i, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  });
}

/** `date` plus whole months, clamped to the target month's last day (31 Aug + 6 → 28 Feb). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  const t = new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay)));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** "08-10-2026" for "2026-10-08". */
export function formatDay(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}-${m}-${y}`;
}
