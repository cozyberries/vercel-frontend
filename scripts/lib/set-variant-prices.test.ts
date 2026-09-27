import { describe, expect, it } from "vitest";
import { basePriceFor, planVariantPrices } from "./set-variant-prices.mjs";

const variant = (product_slug: string, size_slug: string, price = 891, base_price = 849) => ({
  slug: `${product_slug}-${size_slug}`,
  product_slug,
  size_slug,
  price,
  base_price,
});

const variants = [
  variant("frock-a", "3-4y", 604, 575),
  variant("frock-a", "4-5y"),
  variant("frock-a", "5-6y"),
  variant("frock-b", "4-5y"),
  variant("frock-b", "5-6y"),
];

describe("basePriceFor", () => {
  it("takes 5% GST out of the charged price, in whole rupees", () => {
    expect(basePriceFor(749)).toBe(713);
    expect(basePriceFor(891)).toBe(849);
    expect(basePriceFor(604)).toBe(575);
  });
});

describe("planVariantPrices", () => {
  it("changes only the requested sizes of the requested products", () => {
    const plan = planVariantPrices(variants, { products: ["frock-a", "frock-b"], sizes: ["4-5y", "5-6y"], price: 749 });
    expect(plan.map((c) => c.slug)).toEqual(["frock-a-4-5y", "frock-a-5-6y", "frock-b-4-5y", "frock-b-5-6y"]);
    for (const change of plan) {
      expect(change.from).toEqual({ price: 891, base_price: 849 });
      expect(change.to).toEqual({ price: 749, base_price: 713 });
    }
  });

  it("stops when a product × size has no variant", () => {
    expect(() => planVariantPrices(variants, { products: ["frock-a", "frock-c"], sizes: ["4-5y"], price: 749 })).toThrow(
      "no variant for: frock-c 4-5y",
    );
  });

  it("rejects a price that is not a positive whole number of rupees", () => {
    for (const price of [0, -1, 749.5, Number.NaN]) {
      expect(() => planVariantPrices(variants, { products: ["frock-a"], sizes: ["4-5y"], price })).toThrow("price must be");
    }
  });
});
