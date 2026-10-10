// Permanent redirects for renamed product slugs. Plain ESM so next.config.mjs can import it;
// the map itself lives in renamed-products.json (also read by lib/catalog/renamed.ts).
import { readFileSync } from "node:fs";

const renamed = JSON.parse(readFileSync(new URL("./renamed-products.json", import.meta.url), "utf8"));

export function renamedProductRedirects() {
  return Object.entries(renamed.products).map(([from, to]) => ({
    source: `/products/${from}`,
    destination: `/products/${to}`,
    permanent: true,
  }));
}
