#!/usr/bin/env node
// Removes product_images rows that repeat a file (left by scripts/fix-image-gaps.mjs), so the
// gallery shows each photo once. Renumbers display_order 1..N; storage is not touched. Products
// whose rows and storage disagree about which photos exist are listed and left alone.
// The catalog webhook on product_images rebuilds the live catalog afterwards.
//
// Usage: node scripts/dedupe-product-images.mjs [--execute]
// Dry run by default. --execute first saves the affected rows to exports/image-dedupe-<timestamp>.json.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { planDedupedRows } from "./lib/dedupe-image-rows.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env.local") });

const EXECUTE = process.argv.includes("--execute");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const fileName = (url) => url.slice(url.lastIndexOf("/") + 1);

const { data: allRows, error } = await supabase
  .from("product_images")
  .select("*")
  .order("product_slug")
  .order("display_order")
  .range(0, 9999);
if (error) throw new Error(`product_images: ${error.message}`);

const bySlug = Map.groupBy(allRows, (row) => row.product_slug);
const fixes = [];
const skipped = [];
for (const [slug, rows] of bySlug) {
  if (new Set(rows.map((row) => row.url)).size === rows.length) continue;
  const { data: files, error: listError } = await supabase.storage.from("media").list(`products/${slug}`, { limit: 1000 });
  if (listError) throw new Error(`list products/${slug}: ${listError.message}`);
  const plan = planDedupedRows(rows, files.map((file) => file.name));
  if (plan && "skip" in plan) skipped.push({ slug, reason: plan.skip });
  else if (plan) fixes.push({ slug, before: rows, urls: plan.urls });
}

console.log(EXECUTE ? "EXECUTE" : "DRY RUN (pass --execute to apply)");
for (const { slug, before, urls } of fixes) {
  console.log(`\n${slug}\n  rows now:   ${before.map((row) => fileName(row.url)).join(" ")}\n  rows after: ${urls.map(fileName).join(" ")}`);
}
for (const { slug, reason } of skipped) console.log(`\n⚠ ${slug} left alone: ${reason}`);
console.log(`\n${fixes.length} product(s) to fix, ${skipped.length} left alone.`);
if (!EXECUTE || fixes.length === 0) process.exit(skipped.length > 0 ? 1 : 0);

const backup = join(root, "exports", `image-dedupe-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await mkdir(dirname(backup), { recursive: true });
await writeFile(backup, JSON.stringify(Object.fromEntries(fixes.map((f) => [f.slug, f.before])), null, 2));
console.log(`Backed up the rows of ${fixes.length} product(s) to ${backup}`);

const problems = [];
for (const { slug, before, urls } of fixes) {
  const rows = urls.map((url, i) => ({ product_slug: slug, url, is_primary: i === 0, display_order: i + 1 }));
  const { error: deleteError } = await supabase.from("product_images").delete().eq("product_slug", slug);
  if (deleteError) {
    problems.push(`${slug}: delete failed, rows untouched: ${deleteError.message}`);
    continue;
  }
  const { error: insertError } = await supabase.from("product_images").insert(rows);
  if (insertError) {
    await supabase.from("product_images").insert(before);
    problems.push(`${slug}: insert failed, previous rows put back: ${insertError.message}`);
    continue;
  }
  const { data: after } = await supabase.from("product_images").select("url").eq("product_slug", slug).order("display_order");
  if (JSON.stringify((after ?? []).map((row) => row.url)) !== JSON.stringify(urls)) problems.push(`${slug}: rows did not read back as planned`);
  else console.log(`✓ ${slug}: ${before.length} → ${urls.length} rows`);
}
if (problems.length > 0) {
  console.error(`✗ ${problems.join("\n✗ ")}\n  Backup: ${backup}`);
  process.exit(1);
}
console.log(`✓ ${fixes.length} product(s) now list each photo once.`);
