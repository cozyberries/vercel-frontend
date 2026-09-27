#!/usr/bin/env node
// Sets the price of some sizes of some products, e.g. the 4-5Y and 5-6Y of three frocks.
// `--price` is what the customer pays (GST included); base_price is recomputed as round(price / 1.05).
// The catalog webhook on product_variants rebuilds the live catalog afterwards (about 10 seconds).
//
// Usage: node scripts/set-variant-prices.mjs --products=<slug,slug> --sizes=4-5y,5-6y --price=749 [--execute]
// Dry run by default. --execute first saves the rows it will change to exports/price-changes/<timestamp>/,
// updates them in one statement, then reads them back to check every one.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { planVariantPrices } from "./lib/set-variant-prices.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env.local") });

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "1"];
  }),
);
const list = (value) => (value ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const products = list(args.products);
const sizes = list(args.sizes);
const price = Number(args.price);
const EXECUTE = Boolean(args.execute);
if (products.length === 0 || sizes.length === 0 || !args.price) {
  console.error("Usage: node scripts/set-variant-prices.mjs --products=<slug,slug> --sizes=<size,size> --price=<rupees> [--execute]");
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function readVariants() {
  const { data, error } = await supabase.from("product_variants").select("*").in("product_slug", products);
  if (error) throw new Error(`product_variants: ${error.message}`);
  return data;
}

const before = await readVariants();
const plan = planVariantPrices(before, { products, sizes, price });

console.log(`${EXECUTE ? "EXECUTE" : "DRY RUN (pass --execute to apply)"}: ${plan.length} variants`);
for (const { slug, from, to } of plan) {
  console.log(`  ${slug}: ₹${from.price} (base ₹${from.base_price}) → ₹${to.price} (base ₹${to.base_price})`);
}
if (!EXECUTE) process.exit(0);

const slugs = plan.map((change) => change.slug);
const backupDir = join(root, "exports", "price-changes", new Date().toISOString().replace(/[:.]/g, "-"));
await mkdir(backupDir, { recursive: true });
await writeFile(join(backupDir, "variants.json"), JSON.stringify(before.filter((v) => slugs.includes(v.slug)), null, 2));
console.log(`\nBacked up ${slugs.length} rows to ${backupDir}`);

const { to } = plan[0];
const { data: updated, error } = await supabase
  .from("product_variants")
  .update({ ...to, updated_at: new Date().toISOString() })
  .in("slug", slugs)
  .select("slug");
if (error) {
  console.error(`✗ update: ${error.message} (nothing changed; one statement)`);
  process.exit(1);
}
console.log(`Updated ${updated.length} rows`);

const after = await readVariants();
const problems = plan
  .map(({ slug }) => after.find((v) => v.slug === slug))
  .filter((v) => !v || v.price !== to.price || v.base_price !== to.base_price)
  .map((v) => `${v?.slug}: ₹${v?.price} (base ₹${v?.base_price})`);
if (updated.length !== slugs.length) problems.push(`update touched ${updated.length} rows, expected ${slugs.length}`);
if (problems.length > 0) {
  console.error(`✗ Check failed:\n  ${problems.join("\n  ")}\n  Backup: ${backupDir}`);
  process.exit(1);
}
console.log(`✓ All ${slugs.length} variants read back at ₹${to.price} (base ₹${to.base_price}).`);
