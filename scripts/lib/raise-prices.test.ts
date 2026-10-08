import { describe, expect, it } from "vitest";
import { groupByChange, planPriceRaise, raisedPrice } from "./raise-prices.mjs";

const row = (slug: string, price: number | null, base_price = 0) => ({ slug, price, base_price });

describe("raisedPrice", () => {
  it("raises by the percentage to the nearest rupee", () => {
    expect([189, 394, 446, 499, 604, 629, 734, 839, 1784].map((p) => raisedPrice(p, 10))).toEqual([
      208, 433, 491, 549, 664, 692, 807, 923, 1962,
    ]);
  });

  it("rounds a half rupee up without floating-point drift", () => {
    expect(raisedPrice(445, 10)).toBe(490); // 489.5
    expect(raisedPrice(5, 10)).toBe(6); // 5.5
  });
});

describe("planPriceRaise", () => {
  const products = [row("frock-a", 839, 799), row("coord-b", 1784, 1699), row("draft", null)];
  const variants = [row("frock-a-1-2y", 839, 799), row("frock-a-5-6y", 604, 575)];

  it("raises every product and variant and recomputes the pre-GST base price", () => {
    const plan = planPriceRaise({ products, variants, percent: 10, maxUnitPrice: 2500 });
    expect(plan.products).toEqual([
      { slug: "frock-a", from: { price: 839, base_price: 799 }, to: { price: 923, base_price: 879 } },
      { slug: "coord-b", from: { price: 1784, base_price: 1699 }, to: { price: 1962, base_price: 1869 } },
    ]);
    expect(plan.variants).toEqual([
      { slug: "frock-a-1-2y", from: { price: 839, base_price: 799 }, to: { price: 923, base_price: 879 } },
      { slug: "frock-a-5-6y", from: { price: 604, base_price: 575 }, to: { price: 664, base_price: 632 } },
    ]);
  });

  it("leaves rows without a price alone", () => {
    const plan = planPriceRaise({ products, variants, percent: 10, maxUnitPrice: 2500 });
    expect(plan.products.map((c) => c.slug)).not.toContain("draft");
  });

  it("refuses when a raised price would cross the 5% GST ceiling, naming every row", () => {
    expect(() =>
      planPriceRaise({ products: [row("big", 2300)], variants: [row("big-1y", 2400)], percent: 10, maxUnitPrice: 2500 }),
    ).toThrow(/big ₹2300 → ₹2530.*big-1y ₹2400 → ₹2640/s);
  });

  it("refuses a percentage that is not positive or has more than one decimal", () => {
    for (const percent of [0, -5, Number.NaN, 10.25, 101]) {
      expect(() => planPriceRaise({ products, variants, percent, maxUnitPrice: 2500 })).toThrow(/percent/);
    }
  });
});

describe("groupByChange", () => {
  it("groups rows that move between the same prices, so each group is one update", () => {
    const plan = planPriceRaise({
      products: [],
      variants: [row("a", 839, 799), row("b", 839, 799), row("c", 604, 575)],
      percent: 10,
      maxUnitPrice: 2500,
    });
    expect(groupByChange(plan.variants)).toEqual([
      { from: { price: 839, base_price: 799 }, to: { price: 923, base_price: 879 }, slugs: ["a", "b"] },
      { from: { price: 604, base_price: 575 }, to: { price: 664, base_price: 632 }, slugs: ["c"] },
    ]);
  });
});
