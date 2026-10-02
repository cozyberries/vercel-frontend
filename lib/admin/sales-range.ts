import { startOfIstDay } from "@/lib/orders/pickup";

export const SALES_RANGES = ["30d", "3m", "12m", "all"] as const;
export type SalesRange = (typeof SALES_RANGES)[number];
export type SalesBucketSize = "day" | "week" | "month";
export const DEFAULT_SALES_RANGE: SalesRange = "3m";

/** Chip label, the "last …" phrase for empty states, and the comparison period named in tile hints. */
export const SALES_RANGE_COPY: Record<SalesRange, { chip: string; period: string; previous: string | null }> = {
  "30d": { chip: "30 days", period: "the last 30 days", previous: "previous 30 days" },
  "3m": { chip: "3 months", period: "the last 3 months", previous: "previous 13 weeks" },
  "12m": { chip: "12 months", period: "the last 12 months", previous: "previous 12 months" },
  all: { chip: "All time", period: "all time", previous: null },
};

export interface SalesBucket {
  /** IST date of the bucket's first day ("2026-10-02"), or its month ("2026-10"). */
  key: string;
  /** Axis label: "2 Oct" for days and weeks, "Oct '26" for months. */
  label: string;
  start: Date;
  /** Exclusive. */
  end: Date;
}

export interface SalesPeriods {
  bucket: SalesBucketSize;
  /** [from, to). `to` is the end of the last bucket, so it lies after now. */
  current: { from: Date; to: Date };
  /** [from, to), the same length as current; null for All time. */
  previous: { from: Date; to: Date } | null;
  buckets: SalesBucket[];
}

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The IST calendar date (and weekday, 0 = Sunday) of an instant. */
export function istParts(d: Date): { y: number; m: number; day: number; dow: number } {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return { y: ist.getUTCFullYear(), m: ist.getUTCMonth(), day: ist.getUTCDate(), dow: ist.getUTCDay() };
}

/** Midnight IST on an IST calendar date, as a UTC instant. Month and day overflow roll over like Date.UTC. */
function istMidnight(y: number, m: number, day: number): Date {
  return new Date(Date.UTC(y, m, day) - IST_OFFSET_MS);
}

const pad = (n: number) => String(n).padStart(2, "0");

function dayBuckets(first: Date, count: number, stepDays: number): SalesBucket[] {
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(first.getTime() + i * stepDays * DAY_MS);
    const { y, m, day } = istParts(start);
    return {
      key: `${y}-${pad(m + 1)}-${pad(day)}`,
      label: `${day} ${MONTHS[m]}`,
      start,
      end: new Date(start.getTime() + stepDays * DAY_MS),
    };
  });
}

function monthBuckets(y: number, m: number, count: number): SalesBucket[] {
  return Array.from({ length: count }, (_, i) => {
    const start = istMidnight(y, m + i, 1);
    const p = istParts(start);
    return {
      key: `${p.y}-${pad(p.m + 1)}`,
      label: `${MONTHS[p.m]} '${String(p.y).slice(2)}`,
      start,
      end: istMidnight(y, m + i + 1, 1),
    };
  });
}

export function parseSalesRange(value: string | null | undefined): SalesRange | null {
  return value != null && (SALES_RANGES as readonly string[]).includes(value) ? (value as SalesRange) : null;
}

/**
 * The current period, the previous period of the same length, and the buckets for a chip, on IST
 * calendar boundaries. The current period always includes today so far. `firstSaleAt` only matters
 * for All time, which starts in that month.
 */
export function salesPeriods(range: SalesRange, now: Date, firstSaleAt: Date | null): SalesPeriods {
  const today = startOfIstDay(now);
  const { y, m, dow } = istParts(now);
  switch (range) {
    case "30d": {
      const from = new Date(today.getTime() - 29 * DAY_MS);
      const buckets = dayBuckets(from, 30, 1);
      return {
        bucket: "day",
        current: { from, to: buckets[29].end },
        previous: { from: new Date(from.getTime() - 30 * DAY_MS), to: from },
        buckets,
      };
    }
    case "3m": {
      const monday = new Date(today.getTime() - ((dow + 6) % 7) * DAY_MS);
      const from = new Date(monday.getTime() - 12 * 7 * DAY_MS);
      const buckets = dayBuckets(from, 13, 7);
      return {
        bucket: "week",
        current: { from, to: buckets[12].end },
        previous: { from: new Date(from.getTime() - 13 * 7 * DAY_MS), to: from },
        buckets,
      };
    }
    case "12m": {
      const buckets = monthBuckets(y, m - 11, 12);
      const from = buckets[0].start;
      return {
        bucket: "month",
        current: { from, to: buckets[11].end },
        previous: { from: istMidnight(y, m - 23, 1), to: from },
        buckets,
      };
    }
    case "all": {
      const first = istParts(firstSaleAt && firstSaleAt < now ? firstSaleAt : now);
      const count = (y - first.y) * 12 + (m - first.m) + 1;
      const buckets = monthBuckets(first.y, first.m, count);
      return {
        bucket: "month",
        current: { from: buckets[0].start, to: buckets[count - 1].end },
        previous: null,
        buckets,
      };
    }
  }
}

/** Earliest sale date the route must read: the start of the previous period, or null (everything) for All time. */
export function salesWindowStart(range: SalesRange, now: Date): Date | null {
  return salesPeriods(range, now, null).previous?.from ?? null;
}
