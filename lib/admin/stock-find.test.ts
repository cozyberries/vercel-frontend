import { describe, expect, it } from "vitest";
import { productRow, stockRow } from "@/lib/admin/__fixtures__/stock-metrics";
import type { StockProductRow } from "./stock-metrics";
import {
  buildFindTree,
  findEmptyTitle,
  findSizeOptions,
  findState,
  formatFindCounts,
  knownSize,
  matchesGender,
  readStockParams,
  splitStock,
  writeStockParams,
} from "./stock-find";

function product(slug: string, gender: string | null, sizes: Array<[string | null, number, number?]>, over: Partial<StockProductRow> = {}) {
  return productRow({
    slug,
    name: over.name ?? slug,
    gender_slug: gender,
    sizes: sizes.map(([size, stock, order]) =>
      stockRow({
        variant_slug: `${slug}-${size ?? "one"}`,
        product_slug: slug,
        product_name: over.name ?? slug,
        size_slug: size,
        size_label: size ? size.toUpperCase() : "One size",
        size_order: order ?? 0,
        stock,
      }),
    ),
    ...over,
  });
}

describe("splitStock", () => {
  it.each([
    [5, { stall: 1, home: 4 }],
    [2, { stall: 1, home: 1 }],
    [1, { stall: 1, home: 0 }],
    [0, { stall: 0, home: 0 }],
    [-1, { stall: 0, home: 0 }],
  ])("stock %i → %o", (stock, split) => {
    expect(splitStock(stock)).toEqual(split);
  });
});

describe("findState", () => {
  it.each([
    [9, "in"],
    [3, "in"],
    [2, "low"],
    [1, "last"],
    [0, "out"],
    [-2, "out"],
  ])("stock %i is %s", (stock, state) => {
    expect(findState(stock)).toBe(state);
  });
});

describe("matchesGender", () => {
  it.each([
    ["girl", "girl", true],
    ["unisex", "girl", true],
    [null, "girl", true],
    ["boy", "girl", false],
    ["boy", "boy", true],
    ["unisex", "boy", true],
    [null, "boy", true],
    ["girl", "boy", false],
    ["girl", "any", true],
    ["boy", "any", true],
  ] as const)("%s under %s → %s", (slug, gender, expected) => {
    expect(matchesGender(slug, gender)).toBe(expected);
  });
});

describe("findSizeOptions / knownSize", () => {
  const products = [
    product("a", "girl", [["2-3y", 1, 5], ["0-3m", 1, 1]]),
    product("b", "boy", [["2-3y", 0, 5], [null, 1], ["6-12m", 2, 3]]),
  ];

  it("lists each size present once, in catalog order, without one-size", () => {
    expect(findSizeOptions(products)).toEqual([
      { slug: "0-3m", label: "0-3M" },
      { slug: "6-12m", label: "6-12M" },
      { slug: "2-3y", label: "2-3Y" },
    ]);
  });

  it("keeps a known size and treats an unknown one as Any", () => {
    const options = findSizeOptions(products);
    expect(knownSize("2-3y", options)).toBe("2-3y");
    expect(knownSize("9-10y", options)).toBeNull();
    expect(knownSize(null, options)).toBeNull();
  });
});

describe("buildFindTree", () => {
  const products = [
    product("daisy", "girl", [["1-2y", 3, 4], ["2-3y", 0, 5]], { name: "Daisy", category_slug: "girls", category_name: "Girls Coord Sets" }),
    product("navy", "boy", [["2-3y", 5, 5]], { name: "Navy", category_slug: "boys", category_name: "Boys Coord Sets" }),
    product("romper", "unisex", [["2-3y", 1, 5]], { name: "Romper", category_slug: "rompers", category_name: "Rompers" }),
    product("plain", null, [["2-3y", 2, 5]], { name: "Plain", category_slug: "rompers", category_name: "Rompers" }),
    product("blanket", "unisex", [[null, 4]], { name: "Blanket", category_slug: "newborn", category_name: "Newborn" }),
  ];

  it("groups by category with every size, split into stall and home", () => {
    const tree = buildFindTree(products, { gender: "any", size: null });
    expect(tree.map((c) => [c.name, c.products.map((p) => p.name)])).toEqual([
      ["Boys Coord Sets", ["Navy"]],
      ["Girls Coord Sets", ["Daisy"]],
      ["Newborn", ["Blanket"]],
      ["Rompers", ["Plain", "Romper"]],
    ]);
    const daisy = tree[1].products[0];
    expect(daisy.sizes).toEqual([
      { variant_slug: "daisy-1-2y", size_slug: "1-2y", size_label: "1-2Y", stock: 3, stall: 1, home: 2, state: "in" },
      { variant_slug: "daisy-2-3y", size_slug: "2-3y", size_label: "2-3Y", stock: 0, stall: 0, home: 0, state: "out" },
    ]);
    expect(daisy.counts).toEqual({ in: 1, low: 0, last: 0, out: 1 });
    expect(tree[3].counts).toEqual({ in: 0, low: 1, last: 1, out: 0 });
  });

  it("shows girl, unisex and no-gender products for Girl, and drops boys", () => {
    const names = buildFindTree(products, { gender: "girl", size: null }).flatMap((c) => c.products.map((p) => p.name));
    expect(names).toEqual(["Daisy", "Blanket", "Plain", "Romper"]);
  });

  it("shows boy, unisex and no-gender products for Boy", () => {
    const names = buildFindTree(products, { gender: "boy", size: null }).flatMap((c) => c.products.map((p) => p.name));
    expect(names).toEqual(["Navy", "Blanket", "Plain", "Romper"]);
  });

  it("keeps only the picked size, drops one-size items, and lists in stock first", () => {
    const tree = buildFindTree(products, { gender: "girl", size: "2-3y" });
    expect(tree.map((c) => c.name)).toEqual(["Girls Coord Sets", "Rompers"]);
    expect(tree[1].products.map((p) => [p.name, p.sizes.map((s) => s.state)])).toEqual([
      ["Plain", ["low"]],
      ["Romper", ["last"]],
    ]);
    expect(tree[0].products[0].sizes.map((s) => s.size_slug)).toEqual(["2-3y"]);
  });

  it("orders products by state, then name, when a size is picked", () => {
    const tree = buildFindTree(
      [
        product("a-out", "girl", [["2-3y", 0]], { name: "A out", category_slug: "c", category_name: "C" }),
        product("b-in", "girl", [["2-3y", 4]], { name: "B in", category_slug: "c", category_name: "C" }),
        product("c-last", "girl", [["2-3y", 1]], { name: "C last", category_slug: "c", category_name: "C" }),
        product("a-in", "girl", [["2-3y", 3]], { name: "A in", category_slug: "c", category_name: "C" }),
      ],
      { gender: "any", size: "2-3y" },
    );
    expect(tree[0].products.map((p) => p.name)).toEqual(["A in", "B in", "C last", "A out"]);
  });

  it("returns nothing when no product matches", () => {
    expect(buildFindTree(products, { gender: "boy", size: "1-2y" })).toEqual([]);
  });
});

describe("labels", () => {
  it("prints counts without the zero parts", () => {
    expect(formatFindCounts({ in: 12, low: 3, last: 0, out: 2 })).toBe("12 in · 3 low · 2 out");
    expect(formatFindCounts({ in: 0, low: 0, last: 1, out: 0 })).toBe("1 last");
  });

  it("names the active filters in the empty state", () => {
    expect(findEmptyTitle("boy", "3-4Y")).toBe("Nothing in 3-4Y for Boy");
    expect(findEmptyTitle("any", "3-4Y")).toBe("Nothing in 3-4Y");
    expect(findEmptyTitle("girl", null)).toBe("Nothing for Girl");
    expect(findEmptyTitle("any", null)).toBe("No active products");
  });
});

describe("readStockParams / writeStockParams", () => {
  it("reads the Find view and its filters", () => {
    expect(readStockParams("?view=find&gender=girl&size=2-3Y")).toEqual({ view: "find", filters: { gender: "girl", size: "2-3y" } });
  });

  it("falls back to Overview, Any gender and Any size", () => {
    expect(readStockParams("")).toEqual({ view: "overview", filters: { gender: "any", size: null } });
    expect(readStockParams("?view=grid&gender=men&size=")).toEqual({ view: "overview", filters: { gender: "any", size: null } });
  });

  it("writes only non-default values and keeps other params", () => {
    expect(writeStockParams("https://x.test/admin/stock?foo=1", "find", { gender: "boy", size: "4-5y" })).toBe(
      "/admin/stock?foo=1&view=find&gender=boy&size=4-5y",
    );
    expect(writeStockParams("https://x.test/admin/stock?view=find&gender=boy", "find", { gender: "any", size: null })).toBe(
      "/admin/stock?view=find",
    );
    expect(writeStockParams("https://x.test/admin/stock?view=find&gender=boy&size=1-2y", "overview", { gender: "boy", size: "1-2y" })).toBe(
      "/admin/stock",
    );
  });
});
