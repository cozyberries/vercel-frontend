/**
 * Numbered photos in one products/<slug>/ folder: 1.jpg plus its variants (1_detail.webp, …).
 * Other entries (the raw/ folder) are ignored.
 * @param {{ slug: string; files: string[] }} folder
 * @returns {string[][]} suffixes per slot, index 0 = slot 1
 */
function slots({ slug, files }) {
  const bySlot = new Map();
  for (const name of files) {
    const match = name.match(/^(\d+)((?:_[a-z]+)?\.[a-z]+)$/);
    if (!match) continue;
    const n = Number(match[1]);
    if (!bySlot.has(n)) bySlot.set(n, []);
    bySlot.get(n).push(match[2]);
  }
  const numbers = [...bySlot.keys()].sort((a, b) => a - b);
  if (numbers.some((n, i) => n !== i + 1)) {
    throw new Error(`${slug}: photos must be numbered 1..${numbers.length} with no gaps, found ${numbers.join(", ")}`);
  }
  for (const n of numbers) {
    if (!bySlot.get(n).includes(".jpg")) throw new Error(`${slug}: photo ${n} has no ${n}.jpg original`);
  }
  return numbers.map((n) => bySlot.get(n).sort());
}

/**
 * Plans moving the source's first photo (with every variant) to the front of the target, e.g. a
 * model photo filed under the wrong slug. Afterwards both folders are still numbered 1..N in
 * display order: the target's photos shift down one slot and the source's close the gap.
 * @param {{ slug: string; files: string[] }} source file names in products/<source.slug>/
 * @param {{ slug: string; files: string[] }} target file names in products/<target.slug>/
 * @returns {{ moves: { from: string; to: string }[]; images: Record<string, string[]> }}
 *   moves in execution order (each lands on a free path); images: each slug's N.jpg originals in display order
 */
export function planFirstPhotoMove(source, target) {
  if (source.slug === target.slug) throw new Error("source and target must be different products");
  const sourceSlots = slots(source);
  const targetSlots = slots(target);
  if (sourceSlots.length === 0) throw new Error(`${source.slug} has no photos to move`);

  const path = (slug, n, suffix) => `products/${slug}/${n}${suffix}`;
  const moves = [];
  // Highest slot first, so each file moves into a slot that has already been vacated.
  for (let n = targetSlots.length; n >= 1; n--) {
    for (const s of targetSlots[n - 1]) moves.push({ from: path(target.slug, n, s), to: path(target.slug, n + 1, s) });
  }
  for (const s of sourceSlots[0]) moves.push({ from: path(source.slug, 1, s), to: path(target.slug, 1, s) });
  for (let n = 2; n <= sourceSlots.length; n++) {
    for (const s of sourceSlots[n - 1]) moves.push({ from: path(source.slug, n, s), to: path(source.slug, n - 1, s) });
  }

  const originals = (slug, count) => Array.from({ length: count }, (_, i) => path(slug, i + 1, ".jpg"));
  return {
    moves,
    images: {
      [target.slug]: originals(target.slug, targetSlots.length + 1),
      [source.slug]: originals(source.slug, sourceSlots.length - 1),
    },
  };
}
