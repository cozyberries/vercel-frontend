import { GST_REGISTERED_FROM } from "@/lib/config/business";
import { MONTHS, istMidnight, istParts } from "@/lib/admin/sales-range";
import { formatIstDate } from "./register-format";

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const pad = (n: number) => String(n).padStart(2, "0");

function split(month: string): { y: number; m: number } {
  const match = MONTH_RE.exec(month);
  if (!match) throw new Error(`Not a YYYY-MM month: ${month}`);
  return { y: Number(match[1]), m: Number(match[2]) - 1 };
}

/** "2026-09" for a year and a zero-based month; months past either end of the year roll over. */
export function monthKey(y: number, m: number): string {
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function currentIstMonth(now: Date): string {
  const { y, m } = istParts(now);
  return monthKey(y, m);
}

/** [start, end) of a month in IST, as UTC instants. */
export function monthBounds(month: string): { start: Date; end: Date } {
  const { y, m } = split(month);
  return { start: istMidnight(y, m, 1), end: istMidnight(y, m + 1, 1) };
}

/** Every month with a register, newest first: the current IST month back to GST_REGISTERED_FROM. */
export function availableMonths(now: Date): string[] {
  const { y, m } = split(currentIstMonth(now));
  const months: string[] = [];
  for (let i = 0; ; i++) {
    const key = monthKey(y, m - i);
    if (key < GST_REGISTERED_FROM) return months;
    months.push(key);
  }
}

/** The month when it is well-formed and has a register, else null. */
export function parseRegisterMonth(value: string | null | undefined, now: Date): string | null {
  if (value == null || !MONTH_RE.test(value)) return null;
  return availableMonths(now).includes(value) ? value : null;
}

/** The month the owner sends: the last completed one, or the current one during the registration month. */
export function defaultRegisterMonth(now: Date): string {
  const months = availableMonths(now);
  return months[1] ?? months[0] ?? GST_REGISTERED_FROM;
}

export function isUnfinishedMonth(month: string, now: Date): boolean {
  return month === currentIstMonth(now);
}

/** "Sep 2026". */
export function monthLabel(month: string): string {
  const { y, m } = split(month);
  return `${MONTHS[m]} ${y}`;
}

/** First and last IST day covered, as dd-mm-yyyy; an unfinished month runs to today. */
export function registerPeriod(month: string, now: Date): { from: string; to: string; unfinished: boolean } {
  const { start, end } = monthBounds(month);
  const unfinished = isUnfinishedMonth(month, now);
  const last = unfinished ? now : new Date(end.getTime() - 1);
  return { from: formatIstDate(start.toISOString()), to: formatIstDate(last.toISOString()), unfinished };
}
