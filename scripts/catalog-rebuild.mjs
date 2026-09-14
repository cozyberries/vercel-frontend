#!/usr/bin/env node
// Poke the catalog events endpoint (the same path Supabase webhooks use).
//   node scripts/catalog-rebuild.mjs                       # full rebuild against CATALOG_BASE_URL or localhost
//   node scripts/catalog-rebuild.mjs --slug=frock-japanese-soft-pear
//   node scripts/catalog-rebuild.mjs --url=http://localhost:3000
import { config } from "dotenv";

config({ path: ".env.local" });

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "1"];
  }),
);

const base = (args.url ?? process.env.CATALOG_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.CATALOG_WEBHOOK_SECRET;
if (!secret) {
  console.error("CATALOG_WEBHOOK_SECRET is not set (see .env.example)");
  process.exit(1);
}

const slug = args.slug;
const url = `${base}/api/catalog/events${slug ? "" : "?full=1"}`;
const body = slug ? { table: "products", type: "UPDATE", slug } : {};

const response = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json", "x-catalog-secret": secret },
  body: JSON.stringify(body),
});
console.log(`${response.status} ${url}`);
console.log(await response.text());
process.exit(response.ok ? 0 : 1);
