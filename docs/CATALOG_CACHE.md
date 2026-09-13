# Catalog cache runbook

The storefront serves its catalog (products, categories, sizes, ages, genders, colours) from
Upstash Redis in Mumbai. Supabase stays the system of record and is read only by the rebuild job.
Design: `docs/superpowers/specs/2026-09-13-catalog-redis-cache-design.md`.

## Data flow

1. A row changes in Supabase (admin app, CSV script, dashboard, order stock update).
2. Trigger `public.catalog_change_notify()` posts `{table, type, slug…}` to `POST /api/catalog/events`
   with header `x-catalog-secret` (async via pg_net; reads its config from Vault).
3. The events endpoint debounces per scope (8s, Redis `cat:pending:*`), collapses bursts
   (>15 publishes/min → one full rebuild, mute 60s) and publishes to QStash
   (delay 8s, dedup id per 8s bucket, flow control `catalog-rebuild` parallelism 1, 3 retries).
4. QStash calls `POST /api/catalog/rebuild` (signature-verified). The job takes `cat:rebuild:lock`,
   fetches the scope from Supabase, writes `cat:product:{slug}` JSON docs, `cat:reference`,
   `cat:snapshot`, `cat:version`, `cat:meta`, waits for the `cozyberries-search` index, then
   `revalidateTag('product:{slug}')` always and `revalidateTag('catalog')` when the version changed.
5. Pages and API routes read through `lib/catalog/cache.ts` (Next Data Cache). Redis is touched
   only after an invalidation.

## Redis keys (all under `cat:`)

| Key | Contents |
|---|---|
| `cat:product:{slug}` | full product JSON document (indexed by `cozyberries-search`) |
| `cat:snapshot` | all list cards + reference + `version` |
| `cat:reference` | categories, genders, sizes, ages, colours |
| `cat:version` | current snapshot version (sha1 content hash, 16 chars) |
| `cat:meta` | last rebuild status |
| `cat:rebuild:lock`, `cat:pending:*`, `cat:events:published`, `cat:events:muted`, `cat:alert:fallback`, `cat:rl:*` | control keys |

Legacy-mode code (`CATALOG_SOURCE=legacy`) still writes the old `products:*`/`product:*` keys until the cleanup task deletes it; the catalog never reads them.

## Endpoints

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/catalog/events` | `x-catalog-secret` | change events; `?full=1` = manual full rebuild |
| `POST|GET /api/catalog/rebuild` | QStash signature or `Authorization: Bearer $CRON_SECRET` | rebuild a scope; GET/no body = full |
| `POST /api/catalog/rebuild-failed` | QStash signature | Telegram alert after retries are exhausted |
| `GET /api/health/catalog` | public (alerts only with cron bearer) | version, age, counts, last rebuild |
| `GET /api/catalog` | public, static, revalidated on change | the snapshot for browsers |
| `GET /api/search?q=` | public | ranked slugs from Redis Search |
| `GET /api/search/suggestions?q=` | public | header search suggestions |
| compatibility routes `/api/products`, `/api/products/[id]`, `/api/categories`, `/api/{categories,ages,sizes,genders}/options` | public | catalog-backed when `CATALOG_SOURCE=redis` |

## Environment

`CATALOG_SOURCE` (`legacy` | `redis`), `CATALOG_BASE_URL`, `CATALOG_WEBHOOK_SECRET`,
`QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `CRON_SECRET`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Locally set `QSTASH_DEV=true` to use the
QStash dev server. Supabase Vault: `storefront_base_url`, `catalog_webhook_secret`.

## Operations

- Manual full rebuild: `npm run catalog:rebuild` (or `-- --slug=<slug>` for one product).
- Recreate the nightly schedule: `npm run qstash:setup`.
- Verify a deployment: `npm run catalog:verify -- --url=https://cozyberries.in`.
- Health: `curl -s https://cozyberries.in/api/health/catalog`.
- Webhook delivery log in Supabase: `select id, status_code, created from net._http_response order by created desc limit 20;`
- Free-tier budgets: Redis < 3,000 commands/day (Upstash console → Usage), QStash < 1,000 messages/day.

## Troubleshooting

| Symptom | Check |
|---|---|
| Change not visible after 30s | `net._http_response` rows (trigger fired?), QStash console → Logs (delivered?), `/api/health/catalog` `lastRebuild` |
| `X-Cache-Status: FALLBACK` on responses | Redis unreachable or keys missing → run `npm run catalog:rebuild`; Telegram alert throttled to hourly |
| Health `index has N docs, snapshot has M` | run a full rebuild; the index recreates with `existsOk` |
| 429 from rebuild | another rebuild holds the lock; QStash retries automatically |

## Verifying a deployment

`npm run catalog:verify -- --url=https://cozyberries.in` checks: functions in `bom1`, health ok,
`/api/catalog` CDN hit with a version, `/products` HTML embedding that version, a product page
served as a static CDN hit, `/api/products` carrying `X-Catalog-Version`, `/api/search` answering.
Run it after every production deploy of this pipeline and after enabling `CATALOG_SOURCE=redis`.

## Rollout flag

`CATALOG_SOURCE=redis` switches API routes and the product page to the catalog; `legacy` (default)
keeps the old code paths. Flip it in Vercel env and redeploy. Removed in the cleanup phase.

`/products` and `/api/catalog` always read the catalog (they fall back to Supabase when Redis is
empty); rolling those back means reverting the UI commits, not flipping the flag. First-deploy
order: deploy with `legacy`, run `npm run catalog:rebuild` immediately (an empty Redis at build
time bakes a Supabase-built snapshot into the static `/api/catalog` for up to a week), run
`npm run qstash:setup`, apply the Supabase migration once Vault secrets exist, confirm
`/api/health/catalog` is green and `/api/catalog` shows `X-Cache-Status: HIT`, then set `redis`
and run `npm run catalog:verify`.

The Redis Free plan allows exactly one Search index, and `SEARCH.CREATE ... EXISTSOK` only tolerates
an index of the same name. Before the first rebuild, check the database for a leftover index
(`SEARCH.DESCRIBE <name>` in the Upstash console CLI; there is no list command) and drop it, or the
rebuild fails with `Exceeded max index count of 1` and health reports `ok: false`.

## Known limits

A flood of unique `/api/search` queries costs one Redis Search command each (cached per query
afterwards); watch the Upstash Usage tab. The snapshot design suits catalogs of hundreds of
products, not the index's 10K-document ceiling.
