import type { SalesMetrics } from "@/lib/admin/sales-metrics";
import type { SalesRange } from "@/lib/admin/sales-range";

/** A 3-month payload: two weekly buckets, one product, one category. The tests' expected tile text comes from these numbers. */
export function salesMetricsFixture(over: Partial<SalesMetrics> = {}): SalesMetrics {
  return {
    range: "3m",
    bucket: "week",
    period: { from: "2026-07-05T18:30:00.000Z", to: "2026-10-02T04:30:00.000Z" },
    previous: { from: "2026-04-05T18:30:00.000Z", to: "2026-07-05T18:30:00.000Z" },
    first_sale_at: null,
    kpis: {
      sales: { value: 24310, previous: 20600 },
      orders: { value: 14, previous: 11 },
      aov: { value: 1736.43, previous: 1872.73 },
      items_per_order: { value: 2.3, previous: 2.1 },
    },
    channel: { stall: { sales: 15200, orders: 9 }, online: { sales: 9110, orders: 5 } },
    series: [
      { key: "2026-09-21", label: "21 Sep", stall_sales: 0, online_sales: 1200, stall_orders: 0, online_orders: 1, aov: 1200 },
      { key: "2026-09-28", label: "28 Sep", stall_sales: 15200, online_sales: 7910, stall_orders: 9, online_orders: 4, aov: 1777.69 },
    ],
    top_products: [{ slug: "frill-petal", name: "Frill Sleeve Petal Pops", value: 6120, units: 9 }],
    categories: [{ slug: "frill-sleeve-muslin", name: "Frill Sleeve Muslin", value: 9870, units: 14 }],
    generated_at: "2026-10-02T04:30:00.000Z",
    ...over,
  };
}

export function emptySalesMetrics(range: SalesRange): SalesMetrics {
  return salesMetricsFixture({
    range,
    kpis: {
      sales: { value: 0, previous: 0 },
      orders: { value: 0, previous: 0 },
      aov: { value: null, previous: null },
      items_per_order: { value: null, previous: null },
    },
    channel: { stall: { sales: 0, orders: 0 }, online: { sales: 0, orders: 0 } },
    series: [],
    top_products: [],
    categories: [],
  });
}
