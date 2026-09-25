#!/usr/bin/env node
// Lists live products whose first photo has not been tagged for the stall display loop.
// Usage: npm run display:untagged [-- --url=https://cozyberries.in]
// Exit codes: 0 all tagged, 1 some untagged, 2 catalog unreachable.
import { readFileSync } from "node:fs";
import { untaggedProducts } from "./lib/display-untagged.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "1"];
  }),
);
const base = (args.url ?? process.env.CATALOG_BASE_URL ?? "https://cozyberries.in").replace(/\/$/, "");
const tags = JSON.parse(readFileSync(new URL("../lib/display/model-photos.json", import.meta.url), "utf8"));

let products;
try {
  const res = await fetch(`${base}/api/catalog`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  ({ products } = await res.json());
} catch (err) {
  console.error(`Could not read ${base}/api/catalog: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
}

const missing = untaggedProducts(products, tags);
if (missing.length === 0) {
  console.log(`All ${products.length} products are tagged (tag file checked ${tags.checkedAt}).`);
  process.exit(0);
}
console.log(`${missing.length} product(s) need a look at their first photo:`);
for (const product of missing) console.log(`- ${product.slug}\t${product.images?.[0] ?? "(no image)"}`);
console.log("Add each slug to withBaby or withoutBaby in lib/display/model-photos.json, then deploy.");
process.exit(1);
