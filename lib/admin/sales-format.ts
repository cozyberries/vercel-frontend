import { istParts, MONTHS, SALES_RANGE_COPY, type SalesRange } from "./sales-range";
import type { KpiValue, SalesMetrics } from "./sales-metrics";

const RUPEES = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const COUNT = new Intl.NumberFormat("en-IN");

/** "₹24,310"; "—" when there is no value (an average with no orders). */
export function formatRupees(n: number | null): string {
  return n === null ? "—" : RUPEES.format(Math.round(n));
}

/** Axis ticks: "₹950", "₹1.5k", "₹12k", "₹1.2L". */
export function formatRupeesCompact(n: number): string {
  const short = (x: number) => (x >= 10 ? String(Math.round(x)) : String(Math.round(x * 10) / 10));
  if (n >= 100_000) return `₹${short(n / 100_000)}L`;
  if (n >= 1_000) return `₹${short(n / 1_000)}k`;
  return `₹${Math.round(n)}`;
}

export function formatCount(n: number | null): string {
  return n === null ? "—" : COUNT.format(n);
}

export function formatItemsPerOrder(n: number | null): string {
  return n === null ? "—" : n.toFixed(1);
}

/** "Feb 2026", by the IST calendar. */
export function monthYear(iso: string): string {
  const { y, m } = istParts(new Date(iso));
  return `${MONTHS[m]} ${y}`;
}

/** The line under a KPI tile: the change against the previous period, or "since …" for All time. */
export function kpiHint(
  metrics: Pick<SalesMetrics, "range" | "previous" | "first_sale_at">,
  kpi: KpiValue,
): string | undefined {
  const period = SALES_RANGE_COPY[metrics.range].previous;
  if (!metrics.previous || !period) {
    return metrics.first_sale_at ? `since ${monthYear(metrics.first_sale_at)}` : undefined;
  }
  const { value, previous } = kpi;
  if (value === null) return `vs ${period}`;
  if (previous === null || previous === 0) return value === 0 ? `vs ${period}` : `None in ${period}`;
  const pct = Math.round(((value - previous) / previous) * 100);
  if (pct === 0) return `No change vs ${period}`;
  return `${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}% vs ${period}`;
}

export function emptyTitle(range: SalesRange): string {
  return range === "all" ? "No paid orders yet" : `No paid orders in ${SALES_RANGE_COPY[range].period}`;
}
