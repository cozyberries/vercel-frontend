import { describe, expect, it } from "vitest";
import { fakeAdmin, filter, type Op } from "./__fixtures__/fake-supabase";
import { appendImage, createProduct, fetchProduct, ProductError, saveProduct, setImageOrder } from "./db";
import type { AdminProduct } from "./types";

const PRODUCT_ROW = {
  slug: "frock-pine",
  name: "Pine Cone Frock",
  description: null,
  care_instructions: "Hand wash",
  category_slug: "sleeveless-frocks",
  gender_slug: "girl",
  product_images: [
    { url: "https://x/2.jpg", display_order: 2 },
    { url: "https://x/1.jpg", display_order: 1 },
  ],
  product_features: [{ feature: "Cotton", display_order: 1 }],
  product_variants: [
    { slug: "frock-pine-1-2y-pine-cone", price: 980, stock_quantity: 1, size_slug: "1-2y", color_slug: "pine-cone", sizes: { name: "1-2Y", display_order: 4 }, colors: { name: "Pine Cone" } },
    { slug: "frock-pine-0-3m-pine-cone", price: 923, stock_quantity: 2, size_slug: "0-3m", color_slug: "pine-cone", sizes: { name: "0-3M", display_order: 1 }, colors: { name: "Pine Cone" } },
  ],
};

const PRODUCT: AdminProduct = {
  slug: "frock-pine",
  name: "Pine Cone Frock",
  description: "",
  care_instructions: "Hand wash",
  category_slug: "sleeveless-frocks",
  gender_slug: "girl",
  color_slug: "pine-cone",
  color_name: "Pine Cone",
  features: ["Cotton"],
  images: ["https://x/1.jpg", "https://x/2.jpg"],
  variants: [
    { slug: "frock-pine-0-3m-pine-cone", size_slug: "0-3m", size_name: "0-3M", price: 923, stock_quantity: 2 },
    { slug: "frock-pine-1-2y-pine-cone", size_slug: "1-2y", size_name: "1-2Y", price: 980, stock_quantity: 1 },
  ],
};

const writes = (ops: Op[]) => ops.filter((o) => o.action !== "select");

describe("fetchProduct", () => {
  it("orders sizes by the size chart and photos by position, and takes the print from the sizes", async () => {
    const { admin } = fakeAdmin(() => ({ data: PRODUCT_ROW }));
    expect(await fetchProduct(admin, "frock-pine")).toEqual(PRODUCT);
  });
});

describe("saveProduct", () => {
  it("sets stock only if it still holds the count the admin started from, then rolls up the product", async () => {
    const { admin, ops } = fakeAdmin((op) => {
      if (op.table === "product_variants" && op.action === "update") return { data: [{ slug: "frock-pine-0-3m-pine-cone" }] };
      if (op.table === "product_variants" && op.action === "select") return { data: [{ price: 923, stock_quantity: 5 }, { price: 980, stock_quantity: 1 }] };
      if (op.table === "products" && op.action === "select") return { data: PRODUCT_ROW };
    });
    const result = await saveProduct(admin, PRODUCT, {
      variants: [{ slug: "frock-pine-0-3m-pine-cone", stock: { from: 2, to: 5 } }],
      add_sizes: [],
    });
    const [stock, rollup] = writes(ops);
    expect(stock.payload).toMatchObject({ stock_quantity: 5 });
    expect(stock.filters).toEqual([
      ["slug", "eq", "frock-pine-0-3m-pine-cone"],
      ["product_slug", "eq", "frock-pine"],
      ["stock_quantity", "eq", 2],
    ]);
    expect(rollup.table).toBe("products");
    expect(rollup.payload).toMatchObject({ price: 923, base_price: 879, stock_quantity: 6 });
    expect(result.conflicts).toEqual([]);
  });

  it("reports a size whose stock moved meanwhile, with today's count, and leaves it alone", async () => {
    const { admin } = fakeAdmin((op) => {
      if (op.table === "product_variants" && op.action === "update") return { data: [] };
      if (op.table === "product_variants" && op.action === "select") return { data: [] };
      if (op.table === "products" && op.action === "select") {
        return { data: { ...PRODUCT_ROW, product_variants: PRODUCT_ROW.product_variants.map((v) => (v.size_slug === "1-2y" ? { ...v, stock_quantity: 0 } : v)) } };
      }
    });
    const result = await saveProduct(admin, PRODUCT, { variants: [{ slug: "frock-pine-1-2y-pine-cone", stock: { from: 1, to: 4 } }], add_sizes: [] });
    expect(result.conflicts).toEqual([{ size_name: "1-2Y", stock_now: 0 }]);
  });

  it("stores a price with its pre-GST base price", async () => {
    const { admin, ops } = fakeAdmin((op) => (op.table === "products" && op.action === "select" ? { data: PRODUCT_ROW } : { data: [] }));
    await saveProduct(admin, PRODUCT, { variants: [{ slug: "frock-pine-1-2y-pine-cone", price: 1050 }], add_sizes: [] });
    expect(writes(ops)[0].payload).toMatchObject({ price: 1050, base_price: 1000 });
  });

  it("adds sizes as product-size-print in the product's print", async () => {
    const { admin, ops } = fakeAdmin((op) => (op.table === "products" && op.action === "select" ? { data: PRODUCT_ROW } : { data: [] }));
    await saveProduct(admin, PRODUCT, { variants: [], add_sizes: [{ size_slug: "2-3y", price: 980, stock: 3 }] });
    expect(writes(ops)[0]).toMatchObject({
      table: "product_variants",
      action: "insert",
      payload: [{ slug: "frock-pine-2-3y-pine-cone", product_slug: "frock-pine", size_slug: "2-3y", color_slug: "pine-cone", price: 980, base_price: 933, stock_quantity: 3 }],
    });
  });

  it("saves details and rewrites features by position", async () => {
    const { admin, ops } = fakeAdmin((op) => (op.table === "products" && op.action === "select" ? { data: PRODUCT_ROW } : {}));
    await saveProduct(admin, PRODUCT, {
      details: { name: "New", description: "", care_instructions: "", category_slug: "pyjamas", gender_slug: "unisex", features: ["A", "B"] },
      variants: [],
      add_sizes: [],
    });
    const [details, upsert, trim] = writes(ops);
    expect(details.payload).toMatchObject({ name: "New", category_slug: "pyjamas" });
    expect(details.payload).not.toHaveProperty("features");
    expect(upsert.payload).toEqual([
      { feature: "A", product_slug: "frock-pine", display_order: 1 },
      { feature: "B", product_slug: "frock-pine", display_order: 2 },
    ]);
    expect(trim).toMatchObject({ table: "product_features", action: "delete" });
    expect(filter(trim, "display_order")).toBe(2);
  });
});

describe("createProduct", () => {
  const input = {
    slug: "frock-new",
    name: "New Frock",
    description: "",
    care_instructions: "",
    category_slug: "sleeveless-frocks",
    gender_slug: "girl",
    features: [],
    color_slug: "pine-cone",
    sizes: [
      { size_slug: "0-3m", price: 923, stock: 2 },
      { size_slug: "1-2y", price: 980, stock: 0 },
    ],
  };

  it("inserts the product with its cheapest price and total stock, then its sizes", async () => {
    const { admin, ops } = fakeAdmin(() => ({}));
    expect(await createProduct(admin, input)).toBe("frock-new");
    const [product, variants] = writes(ops);
    expect(product.payload).toMatchObject({ slug: "frock-new", name: "New Frock", price: 923, base_price: 879, stock_quantity: 2 });
    expect((variants.payload as Array<{ slug: string }>).map((v) => v.slug)).toEqual(["frock-new-0-3m-pine-cone", "frock-new-1-2y-pine-cone"]);
  });

  it("says so when the web address is taken", async () => {
    const { admin } = fakeAdmin(() => ({ error: { message: "dup", code: "23505" } }));
    await expect(createProduct(admin, input)).rejects.toEqual(new ProductError("A product with this web address already exists", 409));
  });

  it("removes the product again when its sizes can't be saved", async () => {
    const { admin, ops } = fakeAdmin((op) => (op.table === "product_variants" ? { error: { message: "boom" } } : {}));
    await expect(createProduct(admin, input)).rejects.toThrow("boom");
    const last = writes(ops).at(-1)!;
    expect(last).toMatchObject({ table: "products", action: "delete" });
    expect(filter(last, "slug")).toBe("frock-new");
  });
});

describe("photos", () => {
  it("saves a new order with the first photo as the main one and drops removed photos", async () => {
    const { admin, ops } = fakeAdmin((op) => (op.action === "select" ? { data: [{ url: "https://x/1.jpg" }, { url: "https://x/2.jpg" }] } : {}));
    await setImageOrder(admin, "frock-pine", ["https://x/2.jpg"]);
    const [upsert, trim] = writes(ops);
    expect(upsert.payload).toEqual([{ url: "https://x/2.jpg", is_primary: true, product_slug: "frock-pine", display_order: 1 }]);
    expect(upsert.options).toEqual({ onConflict: "product_slug,display_order" });
    expect(filter(trim, "display_order")).toBe(1);
  });

  it("refuses a URL the product doesn't have", async () => {
    const { admin } = fakeAdmin(() => ({ data: [{ url: "https://x/1.jpg" }] }));
    await expect(setImageOrder(admin, "frock-pine", ["https://evil/1.jpg"])).rejects.toBeInstanceOf(ProductError);
  });

  it("appends after the last photo and retries when another upload took that position", async () => {
    let inserts = 0;
    const { admin, ops } = fakeAdmin((op) => {
      if (op.action === "select") return { data: [{ display_order: inserts === 0 ? 2 : 3 }] };
      inserts++;
      return inserts === 1 ? { error: { message: "dup", code: "23505" } } : {};
    });
    await appendImage(admin, "frock-pine", "https://x/new.jpg");
    const tried = writes(ops).map((o) => (o.payload as { display_order: number }).display_order);
    expect(tried).toEqual([3, 4]);
  });

  it("makes the first photo of a product without photos the main one", async () => {
    const { admin, ops } = fakeAdmin((op) => (op.action === "select" ? { data: [] } : {}));
    await appendImage(admin, "frock-new", "https://x/a.jpg");
    expect(writes(ops)[0].payload).toEqual({ product_slug: "frock-new", url: "https://x/a.jpg", display_order: 1, is_primary: true });
  });
});
