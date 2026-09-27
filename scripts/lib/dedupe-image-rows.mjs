const fileName = (url) => url.slice(url.lastIndexOf("/") + 1);

/**
 * New product_images rows for a product whose rows repeat a file: each file once, in file-number
 * order (1.jpg first), which is the display order every photo script keeps. The repeats come from
 * fix-image-gaps rewriting rows by URL, so the rows' own order is not trustworthy for these products.
 * Refuses (skip) when rows and storage disagree about which photos exist, since dropping a row
 * there could hide a photo; that needs a person to look.
 * @param {{ url: string; display_order: number }[]} rows the product's current rows
 * @param {string[]} files names in products/<slug>/ (only the N.jpg originals are compared)
 * @returns {{ urls: string[] } | { skip: string } | null} null when no file repeats
 */
export function planDedupedRows(rows, files) {
  const urls = [...rows].sort((a, b) => a.display_order - b.display_order).map((row) => row.url);
  const distinct = urls.filter((url, i) => urls.indexOf(url) === i);
  if (distinct.length === urls.length) return null;

  const originals = new Set(files.filter((name) => /^\d+\.jpg$/.test(name)));
  const shown = new Set(distinct.map(fileName));
  const missing = [...shown].filter((name) => !originals.has(name));
  if (missing.length > 0) return { skip: `rows point at files not in storage: ${missing.join(", ")}` };
  const hidden = [...originals].filter((name) => !shown.has(name));
  if (hidden.length > 0) return { skip: `storage has photos no row shows: ${hidden.join(", ")}` };
  const number = (url) => Number.parseInt(fileName(url), 10);
  return { urls: distinct.sort((a, b) => number(a) - number(b)) };
}
