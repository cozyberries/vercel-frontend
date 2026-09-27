#!/usr/bin/env node
// Moves one product's first photo, with its webp/avif variants, to the front of another product:
// for a model photo filed under the wrong slug. Both storage folders stay numbered 1..N in display
// order, and both products' product_images rows are rewritten to match (one row per file, so any
// duplicate rows go too). The catalog webhook on product_images rebuilds the live catalog afterwards.
//
// Usage: node scripts/move-first-photo.mjs --from=<slug> --to=<slug> [--execute]
// Dry run by default. --execute first saves every file it will move, plus both products' rows, to
// exports/photo-moves/<timestamp>/, then moves, rewrites the rows and checks every moved file.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { planFirstPhotoMove } from "./lib/move-first-photo.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env.local") });

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "1"];
  }),
);
const { from, to } = args;
const EXECUTE = Boolean(args.execute);
if (!from || !to) {
  console.error("Usage: node scripts/move-first-photo.mjs --from=<slug> --to=<slug> [--execute]");
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const BUCKET = "media";
const URL_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const storage = supabase.storage.from(BUCKET);

const fileName = (url) => url.slice(url.lastIndexOf("/") + 1);
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function listFolder(slug) {
  const { data, error } = await storage.list(`products/${slug}`, { limit: 1000 });
  if (error) throw new Error(`list products/${slug}: ${error.message}`);
  return data.map((entry) => entry.name);
}

async function readRows(slug) {
  const { data, error } = await supabase
    .from("product_images")
    .select("*")
    .eq("product_slug", slug)
    .order("display_order");
  if (error) throw new Error(`product_images for ${slug}: ${error.message}`);
  return data;
}

async function download(path) {
  const { data, error } = await storage.download(path);
  if (error) throw new Error(`download ${path}: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

async function replaceRows(slug, paths, previous) {
  const rows = paths.map((path, i) => ({
    product_slug: slug,
    url: URL_PREFIX + path,
    is_primary: i === 0,
    display_order: i + 1,
  }));
  const { error: deleteError } = await supabase.from("product_images").delete().eq("product_slug", slug);
  if (deleteError) throw new Error(`delete rows for ${slug}: ${deleteError.message}`);
  const { error } = await supabase.from("product_images").insert(rows);
  if (!error) return;
  await supabase.from("product_images").insert(previous);
  throw new Error(`insert rows for ${slug}: ${error.message} (previous rows put back)`);
}

const [sourceFiles, targetFiles] = await Promise.all([listFolder(from), listFolder(to)]);
const plan = planFirstPhotoMove({ slug: from, files: sourceFiles }, { slug: to, files: targetFiles });
const before = { [to]: await readRows(to), [from]: await readRows(from) };
for (const [slug, rows] of Object.entries(before)) {
  const foreign = rows.filter((row) => !row.url.startsWith(URL_PREFIX));
  if (foreign.length > 0) {
    console.error(`${slug} has rows outside ${URL_PREFIX}; not touching it:\n  ${foreign.map((r) => r.url).join("\n  ")}`);
    process.exit(1);
  }
}

console.log(`${EXECUTE ? "EXECUTE" : "DRY RUN (pass --execute to apply)"}: first photo of ${from} → first photo of ${to}`);
for (const slug of [to, from]) {
  console.log(`\n${slug}`);
  console.log(`  rows now:   ${before[slug].map((row) => fileName(row.url)).join(" ")}`);
  console.log(`  rows after: ${plan.images[slug].map(fileName).join(" ")}`);
}
console.log(`\n${plan.moves.length} storage moves, in order:`);
for (const move of plan.moves) console.log(`  ${move.from} → ${move.to}`);
if (!EXECUTE) process.exit(0);

const backupDir = join(root, "exports", "photo-moves", new Date().toISOString().replace(/[:.]/g, "-"));
await mkdir(backupDir, { recursive: true });
await writeFile(join(backupDir, "rows.json"), JSON.stringify(before, null, 2));
await writeFile(join(backupDir, "moves.json"), JSON.stringify(plan.moves, null, 2));
for (const { from: path } of plan.moves) {
  const file = join(backupDir, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, await download(path));
}
console.log(`\nBacked up ${plan.moves.length} files and both products' rows to ${backupDir}`);

let done = 0;
for (const move of plan.moves) {
  const { error } = await storage.move(move.from, move.to);
  if (error) {
    console.error(`✗ move ${move.from} → ${move.to}: ${error.message}`);
    console.error(`  ${done} of ${plan.moves.length} moves were made (moves.json order); rows untouched. Backup: ${backupDir}`);
    process.exit(1);
  }
  done++;
}
console.log(`Moved ${done} files`);

for (const slug of [to, from]) await replaceRows(slug, plan.images[slug], before[slug]);
console.log("Rewrote product_images rows");

const problems = [];
for (const move of plan.moves) {
  const expected = sha256(await readFile(join(backupDir, move.from)));
  if (sha256(await download(move.to)) !== expected) problems.push(`${move.to} is not the file that was ${move.from}`);
}
for (const slug of [to, from]) {
  const originals = (await listFolder(slug)).filter((name) => /^\d+\.jpg$/.test(name)).length;
  if (originals !== plan.images[slug].length) {
    problems.push(`${slug}: ${originals} originals in storage, expected ${plan.images[slug].length}`);
  }
  const rows = await readRows(slug);
  const expected = plan.images[slug].map((path) => URL_PREFIX + path);
  if (JSON.stringify(rows.map((row) => row.url)) !== JSON.stringify(expected) || !rows[0]?.is_primary) {
    problems.push(`${slug}: rows are ${rows.map((row) => fileName(row.url)).join(" ")}`);
  }
}
if (problems.length > 0) {
  console.error(`✗ Check failed:\n  ${problems.join("\n  ")}\n  Backup: ${backupDir}`);
  process.exit(1);
}
console.log(`✓ All ${plan.moves.length} moved files match the backup; both folders and their rows are in order.`);
