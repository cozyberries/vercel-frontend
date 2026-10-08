#!/usr/bin/env node
// Raises every product and variant price by a percentage, e.g. 10% on 7 Oct 2026 when the
// struck-through MRP display ended. `price` is what the customer pays (GST included); base_price
// is recomputed as round(price / 1.05). The catalog webhooks rebuild the live catalog afterwards
// (about 10 seconds).
//
// Usage: node scripts/raise-prices.mjs --percent=10 [--execute] [--again]
// Dry run by default. --execute first saves every row to exports/price-changes/<timestamp>/,
// updates one group of equal prices per statement (only rows still at the old price), then reads
// them all back to check. Each run raises again, so --execute refuses if an earlier raise backup
// exists unless --again is passed. To undo, restore the rows from the backup.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { groupByChange, planPriceRaise } from "./lib/raise-prices.mjs";

// GST_LOW_RATE_MAX_UNIT_PRICE in lib/config/business.ts.
const MAX_UNIT_PRICE = 2500;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env.local") });

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "1"];
  }),
);
const percent = Number(args.percent);
const EXECUTE = Boolean(args.execute);
if (!args.percent) {
  console.error("Usage: node scripts/raise-prices.mjs --percent=<0.1-100> [--execute] [--again]");
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function readRows(table) {
  const { data, error } = await supabase.from(table).select("slug, price, base_price").order("slug");
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}

const before = { products: await readRows("products"), variants: await readRows("product_variants") };
let plan;
try {
  plan = planPriceRaise({ ...before, percent, maxUnitPrice: MAX_UNIT_PRICE });
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}

console.log(
  `${EXECUTE ? "EXECUTE" : "DRY RUN (pass --execute to apply)"}: +${percent}% on ` +
    `${plan.products.length} products and ${plan.variants.length} variants`,
);
for (const table of ["products", "variants"]) {
  console.log(`\n${table}:`);
  for (const { from, to, slugs } of groupByChange(plan[table])) {
    console.log(`  ₹${from.price} (base ₹${from.base_price}) → ₹${to.price} (base ₹${to.base_price})  ×${slugs.length}`);
  }
}
if (!EXECUTE) process.exit(0);

const changesDir = join(root, "exports", "price-changes");
const earlier = existsSync(changesDir)
  ? (await readdir(changesDir)).filter((dir) => existsSync(join(changesDir, dir, "raise-prices.json")))
  : [];
if (earlier.length > 0 && !args.again) {
  console.error(
    `\n✗ A raise already ran (${earlier.join(", ")}). Running again raises the prices again.\n` +
      "  Pass --again if that is what you want.",
  );
  process.exit(1);
}

const backupDir = join(changesDir, new Date().toISOString().replace(/[:.]/g, "-"));
await mkdir(backupDir, { recursive: true });
await writeFile(join(backupDir, "raise-prices.json"), JSON.stringify({ percent, before, plan }, null, 2));
console.log(`\nBacked up ${before.products.length} products and ${before.variants.length} variants to ${backupDir}`);

const problems = [];
for (const [key, table] of [["products", "products"], ["variants", "product_variants"]]) {
  let touched = 0;
  for (const { from, to, slugs } of groupByChange(plan[key])) {
    const { data, error } = await supabase
      .from(table)
      .update({ ...to, updated_at: new Date().toISOString() })
      .in("slug", slugs)
      .eq("price", from.price)
      .eq("base_price", from.base_price)
      .select("slug");
    if (error) {
      console.error(`✗ ${table} ₹${from.price}: ${error.message}. Earlier groups are already raised; backup: ${backupDir}`);
      process.exit(1);
    }
    touched += data.length;
    if (data.length !== slugs.length) {
      problems.push(`${table} ₹${from.price}: updated ${data.length} rows, expected ${slugs.length}`);
    }
  }
  console.log(`Updated ${touched} ${table} rows`);

  const after = await readRows(table);
  for (const { slug, to } of plan[key]) {
    const row = after.find((r) => r.slug === slug);
    if (!row || row.price !== to.price || row.base_price !== to.base_price) {
      problems.push(`${table} ${slug}: ₹${row?.price} (base ₹${row?.base_price}), expected ₹${to.price}`);
    }
  }
}
if (problems.length > 0) {
  console.error(`✗ Check failed:\n  ${problems.join("\n  ")}\n  Backup: ${backupDir}`);
  process.exit(1);
}
console.log(`✓ All ${plan.products.length} products and ${plan.variants.length} variants read back at +${percent}%.`);
