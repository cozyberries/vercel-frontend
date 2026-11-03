import { describe, expect, it } from "vitest";
import {
  basePriceFor,
  isRetiredSlug,
  parseNewProduct,
  parseProductUpdate,
  productRollup,
  slugify,
  variantSlug,
  type KnownSlugs,
} from "./rules";

const KNOWN: KnownSlugs = {
  categories: new Set(["sleeveless-frocks", "pyjamas"]),
  genders: new Set(["girl", "boy", "unisex"]),
  sizes: new Set(["0-3m", "3-6m", "1-2y", "2-3y"]),
  colors: new Set(["pine-cone", "popsicles"]),
};

const CURRENT = new Map([
  ["frock-pine-cone-0-3m-pine-cone", "0-3m"],
  ["frock-pine-cone-3-6m-pine-cone", "3-6m"],
]);

const DETAILS = {
  name: "  Pine Cone Sleeveless Frock ",
  description: "Soft muslin.",
  care_instructions: "Hand wash",
  category_slug: "sleeveless-frocks",
  gender_slug: "girl",
  features: ["Pure cotton", "  ", "Breathable"],
};

describe("basePriceFor / productRollup", () => {
  it("takes 5% GST out of the price, rounded like the price raise did", () => {
    expect(basePriceFor(923)).toBe(879);
    expect(basePriceFor(980)).toBe(933);
  });

  it("uses the cheapest priced size and the total stock, ignoring negative counts", () => {
    expect(
      productRollup([
        { price: 980, stock_quantity: 2 },
        { price: 923, stock_quantity: -1 },
        { price: null, stock_quantity: 3 },
      ]),
    ).toEqual({ price: 923, base_price: 879, stock_quantity: 5 });
  });

  it("is zero stock when every size is out, so a sold-out product is not shown in stock", () => {
    expect(productRollup([{ price: 600, stock_quantity: 0 }]).stock_quantity).toBe(0);
  });
});

describe("slugs", () => {
  it("makes a web address from a name", () => {
    expect(slugify("Soft Pear - Japanese Collar Frock")).toBe("soft-pear-japanese-collar-frock");
    expect(slugify("  Café   Crème!! ")).toBe("cafe-creme");
  });

  it("builds variant slugs as product-size-print", () => {
    expect(variantSlug("frock-pine-cone", "2-3y", "pine-cone")).toBe("frock-pine-cone-2-3y-pine-cone");
  });

  it("knows the slugs that redirect after the 2026-10-10 renames", () => {
    expect(isRetiredSlug("pyjamas-classic-popsicles")).toBe(true);
    expect(isRetiredSlug("pyjamas-with-rib-popsicles")).toBe(false);
  });
});

describe("parseProductUpdate", () => {
  it("trims details and drops empty features", () => {
    const r = parseProductUpdate({ details: DETAILS }, KNOWN, CURRENT);
    expect(r).toEqual({
      ok: true,
      value: {
        details: { ...DETAILS, name: "Pine Cone Sleeveless Frock", features: ["Pure cotton", "Breathable"] },
        variants: [],
        add_sizes: [],
      },
    });
  });

  it("keeps a stock change with the count it started from, and skips an unchanged one", () => {
    const r = parseProductUpdate(
      {
        variants: [
          { slug: "frock-pine-cone-0-3m-pine-cone", stock: { from: 2, to: 5 } },
          { slug: "frock-pine-cone-3-6m-pine-cone", stock: { from: 1, to: 1 } },
        ],
      },
      KNOWN,
      CURRENT,
    );
    expect(r).toEqual({ ok: true, value: { details: undefined, variants: [{ slug: "frock-pine-cone-0-3m-pine-cone", stock: { from: 2, to: 5 } }], add_sizes: [] } });
  });

  it("refuses a size from another product", () => {
    const r = parseProductUpdate({ variants: [{ slug: "other-0-3m-pine-cone", price: 500 }] }, KNOWN, CURRENT);
    expect(r).toEqual({ ok: false, error: "That size isn't part of this product" });
  });

  it("refuses prices above the 5% GST ceiling, fractions and zero", () => {
    for (const price of [2501, 99.5, 0]) {
      const r = parseProductUpdate({ variants: [{ slug: "frock-pine-cone-0-3m-pine-cone", price }] }, KNOWN, CURRENT);
      expect(r.ok).toBe(false);
    }
    const ceiling = parseProductUpdate({ variants: [{ slug: "frock-pine-cone-0-3m-pine-cone", price: 2500 }] }, KNOWN, CURRENT);
    expect(ceiling.ok).toBe(true);
  });

  it("refuses negative or fractional stock", () => {
    for (const to of [-1, 1.5, 10000]) {
      const r = parseProductUpdate({ variants: [{ slug: "frock-pine-cone-0-3m-pine-cone", stock: { from: 1, to } }] }, KNOWN, CURRENT);
      expect(r.ok).toBe(false);
    }
  });

  it("adds a new size but not one the product already has", () => {
    const ok = parseProductUpdate({ add_sizes: [{ size_slug: "1-2y", price: 923, stock: 3 }] }, KNOWN, CURRENT);
    expect(ok).toEqual({ ok: true, value: { details: undefined, variants: [], add_sizes: [{ size_slug: "1-2y", price: 923, stock: 3 }] } });
    const dup = parseProductUpdate({ add_sizes: [{ size_slug: "0-3m", price: 923, stock: 3 }] }, KNOWN, CURRENT);
    expect(dup).toEqual({ ok: false, error: "Size 0-3M is listed twice" });
  });

  it("refuses an unknown category and an empty save", () => {
    expect(parseProductUpdate({ details: { ...DETAILS, category_slug: "hats" } }, KNOWN, CURRENT)).toEqual({ ok: false, error: "Pick a category" });
    expect(parseProductUpdate({}, KNOWN, CURRENT)).toEqual({ ok: false, error: "Nothing to save" });
  });

  it("refuses a missing name", () => {
    expect(parseProductUpdate({ details: { ...DETAILS, name: "  " } }, KNOWN, CURRENT)).toEqual({ ok: false, error: "Name is required" });
  });
});

describe("parseNewProduct", () => {
  const body = { ...DETAILS, color_slug: "pine-cone", sizes: [{ size_slug: "0-3m", price: 923, stock: 2 }] };

  it("makes the web address from the name when none is given", () => {
    const r = parseNewProduct(body, KNOWN);
    expect(r.ok && r.value.slug).toBe("pine-cone-sleeveless-frock");
    expect(r.ok && r.value.sizes).toEqual([{ size_slug: "0-3m", price: 923, stock: 2 }]);
  });

  it("accepts a typed web address but refuses a malformed or retired one", () => {
    expect(parseNewProduct({ ...body, slug: "frock-sleeveless-pine-cone" }, KNOWN)).toMatchObject({ ok: true, value: { slug: "frock-sleeveless-pine-cone" } });
    expect(parseNewProduct({ ...body, slug: "bad--slug" }, KNOWN).ok).toBe(false);
    expect(parseNewProduct({ ...body, slug: "new" }, KNOWN)).toEqual({ ok: false, error: "Pick a longer web address" });
    expect(parseNewProduct({ ...body, slug: "pyjamas-classic-popsicles" }, KNOWN)).toEqual({
      ok: false,
      error: "That web address belonged to a renamed product; pick another",
    });
  });

  it("needs a print and at least one size", () => {
    expect(parseNewProduct({ ...body, color_slug: "plaid" }, KNOWN)).toEqual({ ok: false, error: "Pick a print" });
    expect(parseNewProduct({ ...body, sizes: [] }, KNOWN)).toEqual({ ok: false, error: "Add at least one size" });
  });
});
