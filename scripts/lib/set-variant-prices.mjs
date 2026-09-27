// `price` is what the customer pays, GST included; `base_price` is the same price before 5% GST,
// in whole rupees, as the 20250307100000 migration derived it: round(price / 1.05).
export const GST_RATE = 0.05;
export const basePriceFor = (price) => Math.round(price / (1 + GST_RATE));

/**
 * Plans a price change for every variant of the given products in the given sizes.
 * Throws if the price is not a positive whole number, or if any product × size has no variant,
 * so a typo in a slug stops the run instead of quietly changing fewer rows.
 */
export function planVariantPrices(variants, { products, sizes, price }) {
  if (!Number.isInteger(price) || price <= 0) {
    throw new Error(`price must be a positive whole number of rupees, got ${price}`);
  }
  const to = { price, base_price: basePriceFor(price) };
  const changes = [];
  const missing = [];
  for (const product of products) {
    for (const size of sizes) {
      const matches = variants.filter((v) => v.product_slug === product && v.size_slug === size);
      if (matches.length === 0) missing.push(`${product} ${size}`);
      for (const v of matches) {
        changes.push({ slug: v.slug, from: { price: v.price, base_price: v.base_price }, to });
      }
    }
  }
  if (missing.length > 0) throw new Error(`no variant for: ${missing.join(", ")}`);
  return changes;
}
