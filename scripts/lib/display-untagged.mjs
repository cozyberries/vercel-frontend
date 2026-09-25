/**
 * Live catalog products that lib/display/model-photos.json lists in neither withBaby nor withoutBaby.
 * @template {{ slug: string }} P
 * @param {P[]} products
 * @param {{ withBaby: string[]; withoutBaby: string[] }} tags
 * @returns {P[]}
 */
export function untaggedProducts(products, tags) {
  const known = new Set([...tags.withBaby, ...tags.withoutBaby]);
  return products.filter((product) => !known.has(product.slug));
}
