import { basePriceFor } from "./set-variant-prices.mjs";

/**
 * `price` raised by `percent` to the nearest rupee, halves up. Worked in tenths of a percent on
 * whole numbers so 445 × 1.1 lands on exactly 489.5 and rounds to 490.
 */
export function raisedPrice(price, percent) {
  return Math.round((price * (1000 + Math.round(percent * 10))) / 1000);
}

function planRows(rows, percent) {
  return rows
    .filter((r) => r.price != null)
    .map((r) => {
      const price = raisedPrice(Number(r.price), percent);
      return {
        slug: r.slug,
        from: { price: r.price, base_price: r.base_price },
        to: { price, base_price: basePriceFor(price) },
      };
    });
}

/**
 * Plans raising every product and variant price by `percent` (0.1–100, one decimal), with
 * base_price recomputed from the new price. Rows with no price are left out. Throws, naming every
 * row, if any new price is above `maxUnitPrice` (clothing above ₹2,500 a piece is 18% GST, and
 * the invoice charges a flat 5%).
 */
export function planPriceRaise({ products, variants, percent, maxUnitPrice }) {
  if (!(percent > 0 && percent <= 100) || Math.round(percent * 10) !== percent * 10) {
    throw new Error(`percent must be between 0.1 and 100 with at most one decimal, got ${percent}`);
  }
  const plan = { products: planRows(products, percent), variants: planRows(variants, percent) };
  const over = [...plan.products, ...plan.variants]
    .filter((c) => c.to.price > maxUnitPrice)
    .map((c) => `${c.slug} ₹${c.from.price} → ₹${c.to.price}`);
  if (over.length > 0) {
    throw new Error(`these would be above ₹${maxUnitPrice} (18% GST):\n  ${over.join("\n  ")}`);
  }
  return plan;
}

/** Groups planned changes that share the same from and to prices, in first-seen order. */
export function groupByChange(changes) {
  const groups = new Map();
  for (const { slug, from, to } of changes) {
    const key = `${from.price}|${from.base_price}`;
    if (!groups.has(key)) groups.set(key, { from, to, slugs: [] });
    groups.get(key).slugs.push(slug);
  }
  return [...groups.values()];
}
