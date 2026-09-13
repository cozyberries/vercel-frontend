#!/usr/bin/env node
// Post-deploy checks for the catalog cache. Usage:
//   node scripts/catalog-verify.mjs --url=https://cozyberries.in
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "1"];
  }),
);
const base = (args.url ?? "https://cozyberries.in").replace(/\/$/, "");
const rows = [];
const failures = [];

async function timed(path) {
  const started = Date.now();
  try {
    const res = await fetch(base + path, { redirect: "manual", headers: { accept: "*/*" } });
    const text = await res.text();
    return { res, text, ms: Date.now() - started };
  } catch (err) {
    // Network errors (connection refused, DNS failure, etc.) must not crash the
    // script — turn them into a failing response so every check still runs and
    // the summary table always prints.
    const message = err instanceof Error ? err.message : String(err);
    return {
      res: { status: 0, headers: { get: () => null } },
      text: `ERROR: ${message}`,
      ms: Date.now() - started,
    };
  }
}
function check(name, ok, detail) {
  rows.push({ check: name, ok: ok ? "PASS" : "FAIL", detail: String(detail ?? "").slice(0, 90) });
  if (!ok) failures.push(name);
}

const health = await timed("/api/health/catalog");
const vercelId = health.res.headers.get("x-vercel-id") ?? "";
check("functions run in bom1", /::bom1::/.test(vercelId), vercelId);
let healthBody = {};
try { healthBody = JSON.parse(health.text); } catch {}
check("health ok", health.res.status === 200 && healthBody.ok === true, health.text);

await timed("/api/catalog");
const catalog = await timed("/api/catalog");
const version = (catalog.res.headers.get("etag") ?? "").replace(/"/g, "");
check("/api/catalog is a CDN hit on repeat", catalog.res.headers.get("x-vercel-cache") === "HIT", `${catalog.ms}ms x-vercel-cache=${catalog.res.headers.get("x-vercel-cache")}`);
check("/api/catalog carries a version", /^[0-9a-f]{16}$/.test(version), version);
check("health and catalog agree on version", healthBody.version === version, `${healthBody.version} vs ${version}`);

const products = await timed("/products?category=frocks");
const embedsVersion = products.text.includes(`\\"version\\":\\"${version}\\"`) || products.text.includes(`"version":"${version}"`);
check("/products embeds the current snapshot", products.res.status === 200 && embedsVersion, `${products.ms}ms`);
check("/products answers under 600ms from here", products.ms < 600, `${products.ms}ms`);

let snapshot = {};
try { snapshot = JSON.parse(catalog.text); } catch {}
const slug = snapshot.products?.[0]?.slug;
if (slug) {
  await timed(`/products/${slug}`);
  const pdp = await timed(`/products/${slug}`);
  const cacheControl = pdp.res.headers.get("cache-control") ?? "";
  check("product page is static (no no-store, CDN hit)", pdp.res.headers.get("x-vercel-cache") === "HIT" && !/no-store/.test(cacheControl), `${pdp.ms}ms ${cacheControl}`);
} else {
  check("snapshot has products", false, "no products in /api/catalog");
}

const list = await timed("/api/products?limit=12");
check("/api/products served from the catalog", list.res.headers.get("x-catalog-version") === version, `x-cache-status=${list.res.headers.get("x-cache-status")} ${list.ms}ms`);

const search = await timed("/api/search?q=frock");
check("/api/search answers", search.res.status === 200 && search.text.includes('"slugs"'), `${search.ms}ms`);

console.table(rows);
if (failures.length > 0) {
  console.error(`FAILED: ${failures.join("; ")}`);
  process.exit(1);
}
console.log(`all checks passed against ${base} (version ${version})`);
