#!/usr/bin/env node
// Download every product image from the live catalog to local disk. Usage:
//   npm run images:download
//   npm run images:download -- --slug=coords-set-chinese-collar-soft-pear
//   npm run images:download -- --out=exports/images --concurrency=8
//
// Files land at <out>/<product-slug>/<n>.<ext>, numbered in display order so
// 1 is the primary image — the same order the Flipkart export uses when it
// picks the first four.
//
// Resumable: a file already on disk whose size matches the server's
// Content-Length is skipped, so re-running after an interruption is cheap.

import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "1"];
  }),
);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (args.url ?? "https://cozyberries.in").replace(/\/$/, "");
const OUT_DIR = path.resolve(REPO_ROOT, args.out ?? "exports/images");
const CONCURRENCY = Math.max(1, Number(args.concurrency ?? 6));

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

/** Extension from the URL path, defaulting to .jpg — the catalog is all JPEG. */
function extensionFor(url) {
  const match = /\.([a-z0-9]+)(?:\?|$)/i.exec(new URL(url).pathname);
  return match ? `.${match[1].toLowerCase()}` : ".jpg";
}

async function alreadyHave(file, expectedBytes) {
  try {
    const info = await stat(file);
    // No Content-Length means we cannot compare, so trust any non-empty file.
    return expectedBytes ? info.size === expectedBytes : info.size > 0;
  } catch {
    return false;
  }
}

async function download(url, file) {
  const head = await fetch(url, { method: "HEAD" });
  const expected = Number(head.headers.get("content-length")) || 0;
  if (await alreadyHave(file, expected)) return { status: "skipped", bytes: expected };

  const res = await fetch(url);
  if (!res.ok) return { status: "failed", reason: `HTTP ${res.status}` };
  const body = Buffer.from(await res.arrayBuffer());
  await writeFile(file, body);
  return { status: "downloaded", bytes: body.length };
}

/** Run tasks with a fixed number in flight, preserving the caller's ordering. */
async function pool(items, worker, limit) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i], i);
      }
    }),
  );
  return results;
}

async function main() {
  const catalog = await getJson(`${BASE}/api/catalog`);
  const slugs = args.slug ? [args.slug] : catalog.products.map((p) => p.slug);
  console.log(`Catalog: ${catalog.products.length} products | downloading ${slugs.length}`);

  await mkdir(OUT_DIR, { recursive: true });

  const tally = { downloaded: 0, skipped: 0, failed: 0, bytes: 0 };
  const failures = [];

  for (const [index, slug] of slugs.entries()) {
    const doc = await getJson(`${BASE}/api/products/${slug}`).then((d) => d.product ?? d);
    const images = doc.images ?? [];
    const dir = path.join(OUT_DIR, slug);
    await mkdir(dir, { recursive: true });

    const results = await pool(
      images,
      async (url, i) => {
        const file = path.join(dir, `${i + 1}${extensionFor(url)}`);
        try {
          return await download(url, file);
        } catch (err) {
          return { status: "failed", reason: err.message };
        }
      },
      CONCURRENCY,
    );

    results.forEach((r, i) => {
      tally[r.status] += 1;
      tally.bytes += r.bytes ?? 0;
      if (r.status === "failed") failures.push(`${slug} image ${i + 1}: ${r.reason}`);
    });

    const got = results.filter((r) => r.status !== "failed").length;
    console.log(`  [${String(index + 1).padStart(2)}/${slugs.length}] ${slug} — ${got}/${images.length}`);
  }

  const mb = (tally.bytes / 1024 / 1024).toFixed(1);
  console.log(
    `\nDone: ${tally.downloaded} downloaded, ${tally.skipped} already present, ` +
      `${tally.failed} failed (${mb} MB) -> ${path.relative(REPO_ROOT, OUT_DIR)}`,
  );
  for (const f of failures) console.log(`  FAILED ${f}`);
  if (tally.failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
