/**
 * Fisher–Yates shuffle for one pass of the stall loop. If the shuffle would open on the slide the
 * previous pass ended with, the order is rotated by one so the same product never shows twice in a row.
 */
export function nextCycle<T extends { slug: string }>(
  slides: readonly T[],
  previousLastSlug: string | null,
  random: () => number = Math.random,
): T[] {
  const order = [...slides];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (order.length > 1 && order[0].slug === previousLastSlug) order.push(order.shift()!);
  return order;
}
