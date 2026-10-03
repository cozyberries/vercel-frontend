import { describe, expect, it } from "vitest";
import type { SalesOrderRow } from "./sales-metrics";
import {
  buildStockMetrics,
  LOW_STOCK_MAX,
  productsWithGaps,
  stockState,
  variantResolver,
  type StockMetrics,
  type StockProductRow,
  type StockVariantRow,
} from "./stock-metrics";

const NOW = new Date("2026-10-03T04:30:00Z"); // Sat 3 Oct 2026, 10:00 IST
const TODAY = "2026-10-03T03:00:00Z"; // 08:30 IST
const OLD = "2026-08-01T05:00:00Z"; // outside the 30-day window, inside 60
const RECENT_START = "2026-09-03T18:30:00.000Z"; // 00:00 IST 4 Sep: first instant of the 30-day window
const IDLE_START = "2026-08-04T18:30:00.000Z"; // 00:00 IST 5 Aug: first instant of the 60-day window

interface VariantOpts {
  slug?: string;
  price?: number | null;
  order?: number;
  category?: string | null;
  active?: boolean;
  name?: string;
  sizes?: StockVariantRow["sizes"];
  sizeSlug?: string | null;
}

function variant(product: string, size: string, stock: number | null, opts: VariantOpts = {}): StockVariantRow {
  const category = opts.category === undefined ? "cat-a" : opts.category;
  return {
    slug: opts.slug ?? `${product}-${size}`,
    product_slug: product,
    size_slug: opts.sizeSlug === undefined ? size : opts.sizeSlug,
    stock_quantity: stock,
    price: opts.price === undefined ? 500 : opts.price,
    products: {
      name: opts.name ?? `Name ${product}`,
      is_active: opts.active ?? true,
      category_slug: category,
      categories: category === null ? null : { name: `Category ${category}` },
    },
    sizes: opts.sizes === undefined ? { name: size.toUpperCase(), display_order: opts.order ?? 0 } : opts.sizes,
  };
}

type Line = { sku?: string | null; product_id: string; size?: string | null; quantity: number };
let seq = 0;
function order(at: string, lines: Line[], over: Partial<SalesOrderRow> = {}): SalesOrderRow {
  return {
    id: `order-${++seq}`,
    total_amount: 0,
    fulfilment_method: "pickup",
    status: "collected",
    created_at: at,
    stock_committed_at: at,
    order_items: lines.map((l) => ({ name: null, price: 0, sku: null, size: null, ...l })),
    ...over,
  };
}

const build = (variants: StockVariantRow[], orders: SalesOrderRow[] = []) => buildStockMetrics({ variants, orders, now: NOW });
const row = (m: StockMetrics, slug: string) => m.products.flatMap((p) => p.sizes).find((r) => r.variant_slug === slug)!;

describe("stockState", () => {
  it.each([
    [-1, "out"],
    [0, "out"],
    [1, "low"],
    [2, "low"],
    [3, "in"],
  ] as const)("%d → %s", (stock, state) => {
    expect(stockState(stock)).toBe(state);
  });
  it("calls 1-2 left low", () => {
    expect(LOW_STOCK_MAX).toBe(2);
  });
});

describe("buildStockMetrics: totals", () => {
  it("adds units and value at variant price, and splits sizes into in / low / out", () => {
    const m = build([0, 1, 2, 3, -1].map((s, i) => variant("p", `s${i}`, s, { price: 100 })));
    expect(m.kpis).toEqual({ units: 6, value: 600, sizes: 5, in: 1, low: 2, out: 2 });
    expect(m.generated_at).toBe(NOW.toISOString());
  });

  it("treats a missing or negative stock as 0, and a missing price as 0", () => {
    const m = build([variant("p", "a", null, { price: null }), variant("p", "b", -3)]);
    expect(m.kpis).toEqual({ units: 0, value: 0, sizes: 2, in: 0, low: 0, out: 2 });
    expect(row(m, "p-b").stock).toBe(0);
  });

  it("leaves inactive products out of everything", () => {
    const m = build([variant("live", "a", 2), variant("gone", "a", 10, { active: false })]);
    expect(m.kpis.units).toBe(2);
    expect(m.products.map((p) => p.slug)).toEqual(["live"]);
    expect(m.categories.reduce((s, c) => s + c.units, 0)).toBe(2);
    expect(m.not_selling.map((r) => r.variant_slug)).toEqual(["live-a"]);
  });
});

describe("buildStockMetrics: matching sales to sizes", () => {
  const variants = [
    variant("frill", "0-3m", 1, { slug: "frill-0-3m-petal" }),
    variant("frill", "3-6m", 1, { slug: "frill-3-6m-petal" }),
  ];

  it("matches by sku first", () => {
    const m = build(variants, [order(TODAY, [{ sku: "frill-3-6m-petal", product_id: "frill", size: "0-3M", quantity: 2 }])]);
    expect(row(m, "frill-3-6m-petal").sold_all).toBe(2);
    expect(row(m, "frill-0-3m-petal").sold_all).toBe(0);
  });

  it("falls back to the product and lower-cased size when the sku is missing or unknown", () => {
    const m = build(variants, [
      order(TODAY, [
        { sku: null, product_id: "frill", size: "0-3M", quantity: 1 },
        { sku: "retired-slug", product_id: "frill", size: "0-3M", quantity: 1 },
      ]),
    ]);
    expect(row(m, "frill-0-3m-petal").sold_all).toBe(2);
  });

  it("skips lines that match no size", () => {
    const m = build(variants, [
      order(TODAY, [
        { product_id: "other", size: "0-3M", quantity: 5 },
        { product_id: "frill", size: null, quantity: 5 },
      ]),
    ]);
    expect(row(m, "frill-0-3m-petal").sold_all).toBe(0);
    expect(row(m, "frill-3-6m-petal").sold_all).toBe(0);
  });

  it("takes the first slug when two variants of a product share a size", () => {
    const resolve = variantResolver([
      variant("p", "1-2y", 1, { slug: "p-1-2y-b" }),
      variant("p", "1-2y", 1, { slug: "p-1-2y-a" }),
    ]);
    expect(resolve({ product_id: "p", size: "1-2Y" })).toBe("p-1-2y-a");
  });
});

describe("buildStockMetrics: sales history", () => {
  const variants = [variant("p", "a", 1), variant("q", "a", 1)];

  it("counts only paid orders", () => {
    const statuses = ["payment_pending", "verifying_payment", "cancelled", "refunded", "collected"];
    const m = build(variants, statuses.map((status) => order(TODAY, [{ sku: "p-a", product_id: "p", quantity: 1 }], { status })));
    expect(row(m, "p-a").sold_all).toBe(1);
  });

  it("uses created_at when stock_committed_at is missing", () => {
    const m = build(variants, [
      order("2026-09-20T05:00:00Z", [{ sku: "p-a", product_id: "p", quantity: 1 }], { stock_committed_at: null }),
    ]);
    expect(row(m, "p-a")).toMatchObject({ sold_30d: 1, last_sold_at: "2026-09-20T05:00:00.000Z" });
  });

  it("counts the 30 days from 00:00 IST 29 days ago", () => {
    const m = build(variants, [
      order(RECENT_START, [{ sku: "p-a", product_id: "p", quantity: 1 }]),
      order("2026-09-03T18:29:59.999Z", [{ sku: "p-a", product_id: "p", quantity: 2 }]),
    ]);
    expect(row(m, "p-a")).toMatchObject({ sold_30d: 1, sold_all: 3 });
  });

  it("keeps the latest sale date, and null when a size never sold", () => {
    const m = build(variants, [
      order("2026-09-28T05:00:00Z", [{ sku: "p-a", product_id: "p", quantity: 1 }]),
      order("2026-09-10T05:00:00Z", [{ sku: "p-a", product_id: "p", quantity: 1 }]),
    ]);
    expect(row(m, "p-a").last_sold_at).toBe("2026-09-28T05:00:00.000Z");
    expect(row(m, "q-a").last_sold_at).toBeNull();
  });
});

describe("buildStockMetrics: restock next", () => {
  it("lists out and low sizes by 30-day sales, then all-time sales, then stock, then name", () => {
    const variants = [
      variant("p1", "a", 0),
      variant("p2", "a", 1),
      variant("p3", "a", 2),
      variant("p4", "a", 0),
      variant("pa", "a", 0),
      variant("pb", "a", 0),
      variant("p5", "a", 1),
      variant("pz", "a", 5),
    ];
    const m = build(variants, [
      order(TODAY, [{ sku: "p1-a", product_id: "p1", quantity: 3 }]),
      order(TODAY, [
        { sku: "p2-a", product_id: "p2", quantity: 1 },
        { sku: "p3-a", product_id: "p3", quantity: 1 },
      ]),
      order(OLD, [{ sku: "p2-a", product_id: "p2", quantity: 3 }]),
    ]);
    expect(m.restock.map((r) => r.variant_slug)).toEqual(["p1-a", "p2-a", "p3-a", "p4-a", "pa-a", "pb-a", "p5-a"]);
  });
});

describe("buildStockMetrics: not selling", () => {
  it("lists in-stock sizes with no sale in 60 days, biggest piles first, never-sold before old sales", () => {
    const variants = [
      variant("q1", "a", 10),
      variant("q2", "a", 10),
      variant("q3", "a", 4),
      variant("q4", "a", 6),
      variant("q5", "a", 6),
      variant("q6", "a", 0),
    ];
    const m = build(variants, [
      order("2026-07-01T05:00:00Z", [{ sku: "q2-a", product_id: "q2", quantity: 1 }]),
      order(IDLE_START, [{ sku: "q4-a", product_id: "q4", quantity: 1 }]),
      order("2026-08-04T18:29:59.999Z", [{ sku: "q5-a", product_id: "q5", quantity: 1 }]),
    ]);
    expect(m.not_selling.map((r) => r.variant_slug)).toEqual(["q1-a", "q2-a", "q5-a", "q3-a"]);
  });
});

describe("buildStockMetrics: categories", () => {
  it("totals units, value and sizes per category, biggest first, with Uncategorised for a missing category", () => {
    const m = build([
      variant("p1", "a", 3, { price: 100 }),
      variant("p1", "b", 2, { price: 100 }),
      variant("p2", "a", 10, { price: 50, category: "cat-b" }),
      variant("p3", "a", 1, { price: 10, category: null }),
    ]);
    expect(m.categories).toEqual([
      { slug: "cat-b", name: "Category cat-b", units: 10, value: 500, sizes: 1 },
      { slug: "cat-a", name: "Category cat-a", units: 5, value: 500, sizes: 2 },
      { slug: null, name: "Uncategorised", units: 1, value: 10, sizes: 1 },
    ]);
  });
});

describe("buildStockMetrics: products and size gaps", () => {
  it("lists every active product by name with its sizes in catalog order", () => {
    const m = build([
      variant("zeta", "2-3y", 0, { name: "Zeta", order: 5 }),
      variant("zeta", "1-2y", 3, { name: "Zeta", order: 4 }),
      variant("alpha", "0-3m", 1, { name: "Alpha", order: 1 }),
    ]);
    expect(m.products.map((p) => [p.name, p.out, p.sizes.map((s) => s.size_label)])).toEqual([
      ["Alpha", 0, ["0-3M"]],
      ["Zeta", 1, ["1-2Y", "2-3Y"]],
    ]);
  });

  it("falls back to the size slug, then 'One size', for the label", () => {
    const m = build([
      variant("p", "free", 1, { sizes: null }),
      variant("q", "x", 1, { sizes: null, sizeSlug: null, slug: "q-only" }),
    ]);
    expect(row(m, "p-free").size_label).toBe("free");
    expect(row(m, "q-only").size_label).toBe("One size");
  });

  it("puts products with the most out-of-stock sizes first in the gaps view", () => {
    const product = (name: string, out: number): StockProductRow => ({ slug: name, name, out, sizes: [] });
    expect(productsWithGaps([product("A", 1), product("B", 2), product("C", 0), product("D", 1)]).map((p) => p.name)).toEqual([
      "B",
      "A",
      "D",
    ]);
  });
});

describe("buildStockMetrics: JSON", () => {
  it("survives a JSON round trip unchanged", () => {
    const m = build([variant("p", "a", 1), variant("p", "b", 0)], [order(TODAY, [{ sku: "p-a", product_id: "p", quantity: 1 }])]);
    expect(JSON.parse(JSON.stringify(m))).toEqual(m);
  });
});
