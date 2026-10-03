import type { StockMetrics, StockProductRow, StockSizeRow } from "@/lib/admin/stock-metrics";

export function stockRow(over: Partial<StockSizeRow> = {}): StockSizeRow {
  return {
    variant_slug: "frill-0-3m",
    product_slug: "frill",
    product_name: "Frill Sleeve Petal Pops",
    size_label: "0-3M",
    size_order: 1,
    stock: 0,
    state: "out",
    sold_30d: 3,
    sold_all: 5,
    last_sold_at: "2026-09-28T05:00:00.000Z",
    ...over,
  };
}

const girls: StockProductRow = {
  slug: "girls-daisy",
  name: "Girls Coord Set Blue Daisy",
  out: 2,
  sizes: [
    stockRow({ variant_slug: "gd-1-2y", product_slug: "girls-daisy", product_name: "Girls Coord Set Blue Daisy", size_label: "1-2Y", size_order: 4, stock: 3, state: "in" }),
    stockRow({ variant_slug: "gd-2-3y", product_slug: "girls-daisy", product_name: "Girls Coord Set Blue Daisy", size_label: "2-3Y", size_order: 5, stock: 0, state: "out" }),
    stockRow({ variant_slug: "gd-3-4y", product_slug: "girls-daisy", product_name: "Girls Coord Set Blue Daisy", size_label: "3-4Y", size_order: 6, stock: 1, state: "low" }),
    stockRow({ variant_slug: "gd-4-5y", product_slug: "girls-daisy", product_name: "Girls Coord Set Blue Daisy", size_label: "4-5Y", size_order: 7, stock: 0, state: "out" }),
  ],
};

const boys: StockProductRow = {
  slug: "boys-navy",
  name: "Boys Coord Set Navy",
  out: 0,
  sizes: [
    stockRow({ variant_slug: "bn-4-5y", product_slug: "boys-navy", product_name: "Boys Coord Set Navy", size_label: "4-5Y", size_order: 7, stock: 14, state: "in", sold_30d: 0, sold_all: 0, last_sold_at: null }),
  ],
};

/** A stock page with 12 restock rows (to exercise "Show all"), one idle size and two products. */
export function stockMetricsFixture(over: Partial<StockMetrics> = {}): StockMetrics {
  return {
    kpis: { units: 632, value: 470374, sizes: 187, in: 104, low: 65, out: 18 },
    restock: Array.from({ length: 12 }, (_, i) =>
      stockRow({
        variant_slug: `restock-${i + 1}`,
        product_slug: `restock-${i + 1}`,
        product_name: `Restock product ${i + 1}`,
        stock: i % 3,
        state: i % 3 === 0 ? "out" : "low",
        sold_30d: 12 - i,
      }),
    ),
    not_selling: [boys.sizes[0]],
    categories: [
      { slug: "boys-coord-sets", name: "Boys Coord Sets", units: 248, value: 123400, sizes: 24 },
      { slug: "pyjamas", name: "Pyjamas", units: 68, value: 42160, sizes: 33 },
    ],
    products: [boys, girls],
    generated_at: "2026-10-03T04:30:00.000Z",
    ...over,
  };
}
