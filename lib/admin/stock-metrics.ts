import { startOfIstDay } from "@/lib/orders/pickup";
import { PAID_ORDER_STATUSES, saleDate, type SalesOrderRow } from "./sales-metrics";

/** 1-2 left is low; 0 is out; 3 or more is in stock. */
export const LOW_STOCK_MAX = 2;
export const RECENT_DAYS = 30;
export const IDLE_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export type StockState = "in" | "low" | "out";

export function stockState(stock: number): StockState {
  if (stock <= 0) return "out";
  return stock <= LOW_STOCK_MAX ? "low" : "in";
}

/** One row of the variants query (lib/admin/stock-variants.ts). */
export interface StockVariantRow {
  slug: string;
  product_slug: string;
  size_slug: string | null;
  stock_quantity: number | null;
  price: number | null;
  products: {
    name: string;
    is_active: boolean;
    category_slug: string | null;
    categories: { name: string } | null;
  } | null;
  sizes: { name: string; display_order: number | null } | null;
}

export interface StockSizeRow {
  variant_slug: string;
  product_slug: string;
  product_name: string;
  size_label: string;
  size_order: number;
  stock: number;
  state: StockState;
  sold_30d: number;
  sold_all: number;
  last_sold_at: string | null;
}

export interface StockCategoryRow {
  slug: string | null;
  name: string;
  units: number;
  value: number;
  sizes: number;
}

export interface StockProductRow {
  slug: string;
  name: string;
  out: number;
  sizes: StockSizeRow[];
}

/** The /api/admin/stock payload. JSON-only types; product and size names, counts and dates only. */
export interface StockMetrics {
  kpis: { units: number; value: number; sizes: number; in: number; low: number; out: number };
  restock: StockSizeRow[];
  not_selling: StockSizeRow[];
  categories: StockCategoryRow[];
  products: StockProductRow[];
  generated_at: string;
}

type SaleLine = { sku?: string | null; product_id: string | null; size?: string | null };

const bySlug = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Mirrors public.order_item_variant_slug (the stock trigger's resolver): a variant whose slug is
 * the line's sku, else the product's variant with size_slug = lower(size), first by slug.
 */
export function variantResolver(variants: StockVariantRow[]): (line: SaleLine) => string | null {
  const slugs = new Set(variants.map((v) => v.slug));
  const byProductSize = new Map<string, string>();
  for (const v of [...variants].sort((a, b) => bySlug(a.slug, b.slug))) {
    if (!v.size_slug) continue;
    const key = `${v.product_slug}|${v.size_slug}`;
    if (!byProductSize.has(key)) byProductSize.set(key, v.slug);
  }
  return (line) => {
    if (line.sku && slugs.has(line.sku)) return line.sku;
    if (!line.product_id || !line.size) return null;
    return byProductSize.get(`${line.product_id}|${line.size.toLowerCase()}`) ?? null;
  };
}

const byName = (a: StockSizeRow, b: StockSizeRow) =>
  a.product_name.localeCompare(b.product_name) || a.size_order - b.size_order || bySlug(a.variant_slug, b.variant_slug);

/** Products with at least one size out, most out first, then by name. */
export function productsWithGaps(products: StockProductRow[]): StockProductRow[] {
  return products.filter((p) => p.out > 0).sort((a, b) => b.out - a.out || a.name.localeCompare(b.name));
}

export function buildStockMetrics({
  variants,
  orders,
  now,
}: {
  variants: StockVariantRow[];
  orders: SalesOrderRow[];
  now: Date;
}): StockMetrics {
  const active = variants.filter((v) => v.products?.is_active === true);
  const resolve = variantResolver(active);
  const today = startOfIstDay(now).getTime();
  const recentFrom = today - (RECENT_DAYS - 1) * DAY_MS;
  const idleFrom = today - (IDLE_DAYS - 1) * DAY_MS;

  const sales = new Map<string, { recent: number; all: number; last: number | null }>();
  for (const order of orders) {
    if (!(PAID_ORDER_STATUSES as readonly string[]).includes(order.status)) continue;
    const at = saleDate(order).getTime();
    for (const line of order.order_items ?? []) {
      const slug = resolve(line);
      if (!slug) continue;
      const quantity = Number(line.quantity) || 0;
      const s = sales.get(slug) ?? { recent: 0, all: 0, last: null };
      s.all += quantity;
      if (at >= recentFrom) s.recent += quantity;
      if (s.last === null || at > s.last) s.last = at;
      sales.set(slug, s);
    }
  }

  const kpis = { units: 0, value: 0, sizes: 0, in: 0, low: 0, out: 0 };
  const categories = new Map<string, StockCategoryRow>();
  const rows: StockSizeRow[] = active.map((v) => {
    const stock = Math.max(0, Number(v.stock_quantity) || 0);
    const value = stock * (Number(v.price) || 0);
    const state = stockState(stock);
    kpis.units += stock;
    kpis.value += value;
    kpis.sizes += 1;
    kpis[state] += 1;

    const categorySlug = v.products?.category_slug ?? null;
    const c = categories.get(categorySlug ?? "") ?? {
      slug: categorySlug,
      name: v.products?.categories?.name ?? categorySlug ?? "Uncategorised",
      units: 0,
      value: 0,
      sizes: 0,
    };
    c.units += stock;
    c.value += value;
    c.sizes += 1;
    categories.set(categorySlug ?? "", c);

    const s = sales.get(v.slug);
    return {
      variant_slug: v.slug,
      product_slug: v.product_slug,
      product_name: v.products?.name ?? v.product_slug,
      size_label: v.sizes?.name ?? v.size_slug ?? "One size",
      size_order: v.sizes?.display_order ?? 0,
      stock,
      state,
      sold_30d: s?.recent ?? 0,
      sold_all: s?.all ?? 0,
      last_sold_at: s && s.last !== null ? new Date(s.last).toISOString() : null,
    };
  });

  const restock = rows
    .filter((r) => r.state !== "in")
    .sort((a, b) => b.sold_30d - a.sold_30d || b.sold_all - a.sold_all || a.stock - b.stock || byName(a, b));

  const lastSold = (r: StockSizeRow) => (r.last_sold_at === null ? -Infinity : Date.parse(r.last_sold_at));
  const notSelling = rows
    .filter((r) => r.stock >= 1 && lastSold(r) < idleFrom)
    .sort((a, b) => b.stock - a.stock || lastSold(a) - lastSold(b) || byName(a, b));

  const products = new Map<string, StockProductRow>();
  for (const r of rows) {
    const p = products.get(r.product_slug) ?? { slug: r.product_slug, name: r.product_name, out: 0, sizes: [] };
    p.sizes.push(r);
    if (r.state === "out") p.out += 1;
    products.set(r.product_slug, p);
  }
  for (const p of products.values()) {
    p.sizes.sort((a, b) => a.size_order - b.size_order || bySlug(a.variant_slug, b.variant_slug));
  }

  return {
    kpis,
    restock,
    not_selling: notSelling,
    categories: [...categories.values()].sort((a, b) => b.units - a.units || a.name.localeCompare(b.name)),
    products: [...products.values()].sort((a, b) => a.name.localeCompare(b.name)),
    generated_at: now.toISOString(),
  };
}
