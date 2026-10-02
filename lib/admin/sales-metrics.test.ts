import { describe, expect, it } from "vitest";
import type { Snapshot } from "@/lib/catalog/types";
import {
  buildSalesMetrics,
  catalogLookupFromSnapshot,
  saleDate,
  type CatalogLookup,
  type SalesOrderRow,
} from "./sales-metrics";
import type { SalesRange } from "./sales-range";

const NOW = new Date("2026-10-02T04:30:00Z"); // Fri 2 Oct 2026, 10:00 IST
const TODAY = "2026-10-02T03:00:00Z"; // 08:30 IST, bucket 2026-10-02
const SEP_10 = "2026-09-10T06:00:00Z"; // inside the 30-day period
const AUG_20 = "2026-08-20T06:00:00Z"; // inside the previous 30 days
const JUL_01 = "2026-07-01T06:00:00Z"; // before both

type Line = [slug: string | null, price: number, qty: number, name?: string];
let seq = 0;
function order(at: string, lines: Line[], over: Partial<SalesOrderRow> = {}): SalesOrderRow {
  return {
    id: `order-${++seq}`,
    total_amount: lines.reduce((sum, [, price, qty]) => sum + price * qty, 0),
    fulfilment_method: "pickup",
    status: "collected",
    created_at: at,
    stock_committed_at: at,
    order_items: lines.map(([product_id, price, quantity, name]) => ({
      product_id,
      price,
      quantity,
      name: name ?? `Stored ${product_id}`,
    })),
    ...over,
  };
}

const CATALOG: CatalogLookup = new Map([
  ["frill-petal", { name: "Frill Sleeve Petal Pops", category_slug: "frill-sleeve-muslin", category_name: "Frill Sleeve Muslin" }],
  ["pyjama-pop", { name: "Pyjamas Popsicles", category_slug: "pyjamas", category_name: "Pyjamas" }],
]);

const build = (orders: SalesOrderRow[], range: SalesRange = "30d", catalog: CatalogLookup = CATALOG) =>
  buildSalesMetrics({ orders, catalog, range, now: NOW });
const point = (m: ReturnType<typeof build>, key: string) => m.series.find((s) => s.key === key)!;

describe("buildSalesMetrics: which orders count", () => {
  it("counts only the six paid statuses", () => {
    const statuses = ["payment_pending", "verifying_payment", "cancelled", "refunded", "processing", "delivered"];
    const m = build(statuses.map((status) => order(TODAY, [["frill-petal", 600, 1]], { status })));
    expect(m.kpis.orders.value).toBe(2);
    expect(m.kpis.sales.value).toBe(1200);
  });

  it("counts an order on the IST day it became paid, not the day it was placed", () => {
    const m = build([order(TODAY, [["frill-petal", 600, 1]], { created_at: "2026-08-01T06:00:00Z" })]);
    expect(point(m, "2026-10-02").stall_orders).toBe(1);
    expect(m.kpis.orders.previous).toBe(0);
  });

  it("falls back to created_at for orders paid before stock_committed_at existed", () => {
    const m = build([order(SEP_10, [["frill-petal", 600, 1]], { stock_committed_at: null })]);
    expect(point(m, "2026-09-10").stall_orders).toBe(1);
    expect(saleDate({ stock_committed_at: null, created_at: SEP_10 }).toISOString()).toBe("2026-09-10T06:00:00.000Z");
  });

  it("puts an order paid exactly at IST midnight on the first day in the current period", () => {
    const m = build([
      order("2026-09-02T18:30:00.000Z", [["frill-petal", 600, 1]]),
      order("2026-09-02T18:29:59.999Z", [["frill-petal", 600, 1]]),
    ]);
    expect(m.kpis.orders).toEqual({ value: 1, previous: 1 });
    expect(point(m, "2026-09-03").stall_orders).toBe(1);
  });

  it("ignores orders older than both periods", () => {
    expect(build([order(JUL_01, [["frill-petal", 600, 1]])]).kpis.orders).toEqual({ value: 0, previous: 0 });
  });
});

describe("buildSalesMetrics: numbers", () => {
  const m = build([
    order(TODAY, [["frill-petal", 600, 2]]), // stall ₹1,200, 2 units
    order(SEP_10, [["pyjama-pop", 450, 3]], { fulfilment_method: "delivery", total_amount: 1440 }), // online ₹1,350 + ₹90 delivery
    order(AUG_20, [["frill-petal", 600, 1]]), // previous period
  ]);

  it("sums amount collected, orders, average order and items per order, with previous values", () => {
    expect(m.kpis).toEqual({
      sales: { value: 2640, previous: 600 },
      orders: { value: 2, previous: 1 },
      aov: { value: 1320, previous: 600 },
      items_per_order: { value: 2.5, previous: 1 },
    });
  });

  it("splits sales and orders by channel: pickup is Stall, delivery is Online", () => {
    expect(m.channel).toEqual({ stall: { sales: 1200, orders: 1 }, online: { sales: 1440, orders: 1 } });
  });

  it("zero-fills a daily series that adds up to the period's sales", () => {
    expect(m.bucket).toBe("day");
    expect(m.series).toHaveLength(30);
    expect(point(m, "2026-10-02")).toMatchObject({ stall_sales: 1200, online_sales: 0, stall_orders: 1, aov: 1200 });
    expect(point(m, "2026-09-10")).toMatchObject({ stall_sales: 0, online_sales: 1440, online_orders: 1, aov: 1440 });
    expect(point(m, "2026-09-11")).toEqual({
      key: "2026-09-11", label: "11 Sep", stall_sales: 0, online_sales: 0, stall_orders: 0, online_orders: 0, aov: null,
    });
    expect(m.series.reduce((s, p) => s + p.stall_sales + p.online_sales, 0)).toBe(2640);
  });

  it("reports the period it covers and the one it compares with", () => {
    expect(m.range).toBe("30d");
    expect(m.period).toEqual({ from: "2026-09-02T18:30:00.000Z", to: NOW.toISOString() });
    expect(m.previous).toEqual({ from: "2026-08-03T18:30:00.000Z", to: "2026-09-02T18:30:00.000Z" });
    expect(m.generated_at).toBe(NOW.toISOString());
  });

  it("ranks products and categories by line value (price × qty, no delivery)", () => {
    expect(m.top_products).toEqual([
      { slug: "pyjama-pop", name: "Pyjamas Popsicles", value: 1350, units: 3 },
      { slug: "frill-petal", name: "Frill Sleeve Petal Pops", value: 1200, units: 2 },
    ]);
    expect(m.categories).toEqual([
      { slug: "pyjamas", name: "Pyjamas", value: 1350, units: 3 },
      { slug: "frill-sleeve-muslin", name: "Frill Sleeve Muslin", value: 1200, units: 2 },
    ]);
  });
});

describe("buildSalesMetrics: empty and All time", () => {
  it("returns zeros and nulls when nothing sold", () => {
    const m = build([]);
    expect(m.kpis).toEqual({
      sales: { value: 0, previous: 0 },
      orders: { value: 0, previous: 0 },
      aov: { value: null, previous: null },
      items_per_order: { value: null, previous: null },
    });
    expect(m.series.every((p) => p.stall_orders + p.online_orders === 0 && p.aov === null)).toBe(true);
    expect(m.top_products).toEqual([]);
    expect(m.categories).toEqual([]);
  });

  it("starts All time at the first sale's month, with no comparison", () => {
    const m = build([order(JUL_01, [["frill-petal", 600, 1]]), order(TODAY, [["frill-petal", 600, 1]])], "all");
    expect(m.series.map((p) => p.key)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(m.previous).toBeNull();
    expect(m.first_sale_at).toBe("2026-07-01T06:00:00.000Z");
    expect(m.kpis.sales).toEqual({ value: 1200, previous: null });
    expect(m.kpis.aov).toEqual({ value: 600, previous: null });
  });

  it("leaves first_sale_at null outside All time", () => {
    expect(build([order(TODAY, [["frill-petal", 600, 1]])]).first_sale_at).toBeNull();
  });
});

describe("buildSalesMetrics: products and categories", () => {
  it("lists 8 products and folds the rest into one Other row", () => {
    const orders = Array.from({ length: 10 }, (_, i) => order(TODAY, [[`p${i + 1}`, 100 * (i + 1), 1]]));
    const m = build(orders, "30d", null);
    expect(m.top_products).toHaveLength(9);
    expect(m.top_products[0]).toMatchObject({ slug: "p10", value: 1000 });
    expect(m.top_products[7]).toMatchObject({ slug: "p3", value: 300 });
    expect(m.top_products[8]).toEqual({ slug: null, name: "Other (2 products)", value: 300, units: 2, other_count: 2 });
  });

  it("shows a ninth product as itself rather than as 'Other (1 products)'", () => {
    const orders = Array.from({ length: 9 }, (_, i) => order(TODAY, [[`p${i + 1}`, 100 * (i + 1), 1]]));
    const m = build(orders, "30d", null);
    expect(m.top_products).toHaveLength(9);
    expect(m.top_products.some((r) => r.name.startsWith("Other"))).toBe(false);
  });

  it("merges the sizes of one product into one row", () => {
    const m = build([order(TODAY, [["frill-petal", 600, 1, "Frill 0-3M"], ["frill-petal", 650, 2, "Frill 3-6M"]])]);
    expect(m.top_products).toEqual([{ slug: "frill-petal", name: "Frill Sleeve Petal Pops", value: 1900, units: 3 }]);
  });

  it("names a product missing from the catalog by its latest stored name, under Other", () => {
    const m = build([
      order(SEP_10, [["retired-frock", 500, 1, "Old Frock (3-4Y)"]]),
      order(TODAY, [["retired-frock", 500, 1, "Old Frock"]]),
    ]);
    expect(m.top_products).toEqual([{ slug: "retired-frock", name: "Old Frock", value: 1000, units: 2 }]);
    expect(m.categories).toEqual([{ slug: null, name: "Other", value: 1000, units: 2 }]);
  });

  it("puts everything under Uncategorised, with stored names, when the catalog is unavailable", () => {
    const m = build([order(TODAY, [["frill-petal", 600, 1, "Frill as sold"], ["pyjama-pop", 450, 2]])], "30d", null);
    expect(m.categories).toEqual([{ slug: null, name: "Uncategorised", value: 1500, units: 3 }]);
    expect(m.top_products.map((p) => p.name)).toEqual(["Stored pyjama-pop", "Frill as sold"]);
  });
});

describe("buildSalesMetrics: rough input", () => {
  it("adds numeric columns that arrive as strings", () => {
    const m = build([
      order(TODAY, [], {
        total_amount: "1200.50",
        order_items: [{ product_id: "frill-petal", name: "F", price: "600.25", quantity: 2 }],
      }),
    ]);
    expect(m.kpis.sales.value).toBe(1200.5);
    expect(m.top_products[0].value).toBe(1200.5);
  });

  it("counts an order with no lines, and a line with no product id or name, without crashing", () => {
    const m = build([
      order(TODAY, [], { order_items: null, total_amount: 300 }),
      order(TODAY, [], { order_items: [{ product_id: null, name: null, price: 200, quantity: 1 }], total_amount: 200 }),
    ]);
    expect(m.kpis.orders.value).toBe(2);
    expect(m.kpis.items_per_order.value).toBe(0.5);
    expect(m.top_products).toEqual([{ slug: null, name: "Unnamed product", value: 200, units: 1 }]);
  });

  it("counts a sale stamped a minute in the future (clock skew) in today's bucket", () => {
    const m = build([order(new Date(NOW.getTime() + 60_000).toISOString(), [["frill-petal", 600, 1]])]);
    expect(point(m, "2026-10-02").stall_orders).toBe(1);
  });

  it("survives a JSON round trip unchanged, because Redis stores it as JSON", () => {
    const m = build([order(TODAY, [["frill-petal", 600, 2]]), order(AUG_20, [["pyjama-pop", 450, 1]])]);
    expect(JSON.parse(JSON.stringify(m))).toEqual(m);
  });
});

describe("catalogLookupFromSnapshot", () => {
  it("maps each slug to its name and category, using the reference list when the product has no embedded category", () => {
    const snapshot = {
      version: "v",
      generatedAt: NOW.toISOString(),
      products: [
        { slug: "a", name: "A", category_slug: "cat-a", categories: { name: "Cat A", slug: "cat-a" } },
        { slug: "b", name: "B", category_slug: "cat-b", categories: null },
      ],
      reference: {
        categories: [{ slug: "cat-b", name: "Cat B", description: null, image: null, display: true }],
        genders: [],
        sizes: [],
        ages: [],
        colors: [],
      },
    } as unknown as Snapshot;
    expect(catalogLookupFromSnapshot(snapshot)).toEqual(
      new Map([
        ["a", { name: "A", category_slug: "cat-a", category_name: "Cat A" }],
        ["b", { name: "B", category_slug: "cat-b", category_name: "Cat B" }],
      ]),
    );
  });
});
