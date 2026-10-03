import type { Snapshot } from "@/lib/catalog/types";
import { salesPeriods, type SalesBucketSize, type SalesRange } from "./sales-range";

/** The statuses the orders_on_status_change trigger treats as paid. */
export const PAID_ORDER_STATUSES = [
  "payment_confirmed",
  "processing",
  "ready_for_pickup",
  "collected",
  "shipped",
  "delivered",
] as const;

/** At most this many products are listed; the rest fold into one "Other (N products)" row. */
export const TOP_PRODUCTS = 8;

export interface SalesOrderLine {
  product_id: string | null;
  name: string | null;
  price: number | string;
  quantity: number;
  /** Variant slug resolved at checkout (from 25 Sep 2026); used by the stock page. */
  sku?: string | null;
  /** Size label as sold, e.g. "0-3M"; used by the stock page. */
  size?: string | null;
}

/** One row of the paged orders query (lib/admin/sales-orders.ts). */
export interface SalesOrderRow {
  id: string;
  total_amount: number | string;
  fulfilment_method: string | null;
  status: string;
  created_at: string;
  stock_committed_at: string | null;
  order_items: SalesOrderLine[] | null;
}

export interface CatalogEntry {
  name: string;
  category_slug: string | null;
  category_name: string | null;
}

/** Product slug → its current catalog entry; null when the snapshot could not be loaded. */
export type CatalogLookup = Map<string, CatalogEntry> | null;

export interface KpiValue {
  value: number | null;
  /** null for All time, or (for averages) when the previous period had no orders. */
  previous: number | null;
}

export interface RankedRow {
  slug: string | null;
  name: string;
  value: number;
  units: number;
  other_count?: number;
}

export interface SalesSeriesPoint {
  key: string;
  label: string;
  stall_sales: number;
  online_sales: number;
  stall_orders: number;
  online_orders: number;
  aov: number | null;
}

/**
 * The /api/admin/dashboard/sales payload. JSON-only types, because it is cached in Redis as is.
 * Aggregates and product names only: never customer or order identifiers.
 */
export interface SalesMetrics {
  range: SalesRange;
  bucket: SalesBucketSize;
  /** `to` is when it was computed. */
  period: { from: string; to: string };
  previous: { from: string; to: string } | null;
  /** The first paid order's sale date; only set for All time. */
  first_sale_at: string | null;
  kpis: Record<"sales" | "orders" | "aov" | "items_per_order", KpiValue>;
  channel: Record<"stall" | "online", { sales: number; orders: number }>;
  series: SalesSeriesPoint[];
  top_products: RankedRow[];
  categories: RankedRow[];
  generated_at: string;
}

export function catalogLookupFromSnapshot(snapshot: Snapshot): Map<string, CatalogEntry> {
  const categoryNames = new Map(snapshot.reference.categories.map((c) => [c.slug, c.name]));
  return new Map(
    snapshot.products.map((p) => {
      const slug = p.categories?.slug ?? p.category_slug ?? null;
      const name = p.categories?.name ?? (slug ? categoryNames.get(slug) ?? null : null);
      return [p.slug, { name: p.name, category_slug: slug, category_name: name }];
    }),
  );
}

/** When an order counts: the moment it became paid, or its order date for orders from before 25 Sep 2026. */
export function saleDate(order: Pick<SalesOrderRow, "stock_committed_at" | "created_at">): Date {
  return new Date(order.stock_committed_at ?? order.created_at);
}

interface Totals {
  sales: number;
  orders: number;
  units: number;
}

function totals(orders: SalesOrderRow[]): Totals {
  let sales = 0;
  let units = 0;
  for (const o of orders) {
    sales += Number(o.total_amount) || 0;
    for (const line of o.order_items ?? []) units += Number(line.quantity) || 0;
  }
  return { sales, orders: orders.length, units };
}

const average = (sum: number, count: number): number | null => (count > 0 ? sum / count : null);
const within = (d: Date, from: Date, to: Date) => d >= from && d < to;
const isStall = (o: SalesOrderRow) => o.fulfilment_method === "pickup";
const byValue = (a: RankedRow, b: RankedRow) =>
  b.value - a.value || b.units - a.units || a.name.localeCompare(b.name);

function kpis(cur: Totals, prev: Totals | null): SalesMetrics["kpis"] {
  return {
    sales: { value: cur.sales, previous: prev ? prev.sales : null },
    orders: { value: cur.orders, previous: prev ? prev.orders : null },
    aov: { value: average(cur.sales, cur.orders), previous: prev ? average(prev.sales, prev.orders) : null },
    items_per_order: {
      value: average(cur.units, cur.orders),
      previous: prev ? average(prev.units, prev.orders) : null,
    },
  };
}

/** Top 8 plus one "Other (N products)" row; a single leftover is shown as itself. */
function foldTail(rows: RankedRow[]): RankedRow[] {
  if (rows.length <= TOP_PRODUCTS + 1) return rows;
  const rest = rows.slice(TOP_PRODUCTS);
  return [
    ...rows.slice(0, TOP_PRODUCTS),
    {
      slug: null,
      name: `Other (${rest.length} products)`,
      value: rest.reduce((s, r) => s + r.value, 0),
      units: rest.reduce((s, r) => s + r.units, 0),
      other_count: rest.length,
    },
  ];
}

function rankLines(orders: SalesOrderRow[], catalog: CatalogLookup): { products: RankedRow[]; categories: RankedRow[] } {
  const products = new Map<string, RankedRow & { nameAt: number }>();
  const categories = new Map<string, RankedRow>();
  for (const order of orders) {
    const at = saleDate(order).getTime();
    for (const line of order.order_items ?? []) {
      const quantity = Number(line.quantity) || 0;
      const value = (Number(line.price) || 0) * quantity;
      const slug = line.product_id || null;
      const stored = line.name?.trim() || slug || "Unnamed product";

      const productKey = slug ?? `name:${stored}`;
      const p = products.get(productKey) ?? { slug, name: stored, nameAt: -Infinity, value: 0, units: 0 };
      if (at >= p.nameAt) {
        p.name = stored;
        p.nameAt = at;
      }
      p.value += value;
      p.units += quantity;
      products.set(productKey, p);

      const entry = slug ? catalog?.get(slug) : undefined;
      const category =
        catalog === null
          ? { slug: null, name: "Uncategorised" }
          : entry?.category_slug
            ? { slug: entry.category_slug, name: entry.category_name ?? entry.category_slug }
            : { slug: null, name: "Other" };
      const categoryKey = category.slug ?? `name:${category.name}`;
      const c = categories.get(categoryKey) ?? { ...category, value: 0, units: 0 };
      c.value += value;
      c.units += quantity;
      categories.set(categoryKey, c);
    }
  }
  const ranked = [...products.values()]
    .map(({ slug, name, value, units }) => ({ slug, name: (slug && catalog?.get(slug)?.name) || name, value, units }))
    .sort(byValue);
  return { products: foldTail(ranked), categories: [...categories.values()].sort(byValue) };
}

export function buildSalesMetrics({
  orders,
  catalog,
  range,
  now,
}: {
  orders: SalesOrderRow[];
  catalog: CatalogLookup;
  range: SalesRange;
  now: Date;
}): SalesMetrics {
  const paid = orders.filter((o) => (PAID_ORDER_STATUSES as readonly string[]).includes(o.status));
  const firstSaleAt = paid.reduce<Date | null>((min, o) => {
    const d = saleDate(o);
    return min === null || d < min ? d : min;
  }, null);
  const periods = salesPeriods(range, now, firstSaleAt);
  const { current: cw, previous: ppw } = periods;
  // Same elapsed time in both periods, so a part-finished week or month isn't compared with a full one.
  const elapsed = now.getTime() - cw.from.getTime();
  const pw = ppw
    ? { from: ppw.from, to: new Date(Math.min(ppw.to.getTime(), ppw.from.getTime() + Math.max(0, elapsed))) }
    : null;

  const current = paid.filter((o) => within(saleDate(o), cw.from, cw.to));
  const previous = pw ? paid.filter((o) => within(saleDate(o), pw.from, pw.to)) : null;
  const stall = totals(current.filter(isStall));
  const online = totals(current.filter((o) => !isStall(o)));

  const series = periods.buckets.map((b) => {
    const inBucket = current.filter((o) => within(saleDate(o), b.start, b.end));
    const s = totals(inBucket.filter(isStall));
    const o = totals(inBucket.filter((x) => !isStall(x)));
    return {
      key: b.key,
      label: b.label,
      stall_sales: s.sales,
      online_sales: o.sales,
      stall_orders: s.orders,
      online_orders: o.orders,
      aov: average(s.sales + o.sales, s.orders + o.orders),
    };
  });

  const { products, categories } = rankLines(current, catalog);
  return {
    range,
    bucket: periods.bucket,
    period: { from: cw.from.toISOString(), to: now.toISOString() },
    previous: pw ? { from: pw.from.toISOString(), to: pw.to.toISOString() } : null,
    first_sale_at: range === "all" && firstSaleAt ? firstSaleAt.toISOString() : null,
    kpis: kpis(totals(current), previous ? totals(previous) : null),
    channel: {
      stall: { sales: stall.sales, orders: stall.orders },
      online: { sales: online.sales, orders: online.orders },
    },
    series,
    top_products: products,
    categories,
    generated_at: now.toISOString(),
  };
}
