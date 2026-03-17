# Products API — Upstash Search as Source (Option B)

**Date:** 2026-03-17  
**Branch:** `feature/products-api-upstash-search`

## Goal

`GET /api/products` and all filtered product listing (category, gender, size, age, featured, search) must source "which products" from **cache or Upstash Search only**. Supabase is used only to enrich full product payload (images, variants, sizes) by slug. Global search (`/api/search/suggestions`) already queries Upstash when configured.

## Design

- **Cache (memory + Redis):** Unchanged. Cache key includes all params (limit, page, category, search, size, gender, age, featured, sort). On HIT we return cached response; source is either from a previous Upstash or Supabase miss.
- **Cache miss:** When `UPSTASH_SEARCH_*` is set:
  1. Call `queryProductSlugs()` with filters (and optional search query).
  2. Fetch full product rows from Supabase by those slugs (single `.in('slug', slugs)`).
  3. Sort in app (price, name, created_at), paginate, return. Header: `X-Data-Source: UPSTASH_SEARCH`.
- **Fallback:** If Upstash is not configured or the Upstash path throws, fall back to existing Supabase query; header: `X-Data-Source: SUPABASE_DATABASE`.
- **Background refresh:** When revalidating stale cache, use the same logic: if search configured, refresh from Upstash + Supabase; else from Supabase.

## Index extension

Product documents in `cozyburry-search` were extended with filter/sort fields:

- `category_slug`, `gender_slug`, `size_slugs` (array), `price`, `created_at`, `is_featured`

Reindex cron (`/api/cron/reindex-search`) was updated to populate these from Supabase. Run a reindex after deploy so the new fields are present.

## Files changed

- `lib/services/search-client.ts` — Extended `SearchDocument`; added `queryProductSlugs()` and `ProductListSearchParams`.
- `app/api/cron/reindex-search/route.ts` — Products select and document build now include the new fields.
- `app/api/products/route.ts` — Imports search-client; added `fetchProductsFromUpstashAndSupabase()`; GET uses Upstash path when configured; background refresh uses Upstash when configured.

## Behaviour summary

| Request                    | Source (when Upstash configured) |
|---------------------------|-----------------------------------|
| Any filter or search       | Cache → Upstash Search → enrich Supabase |
| No filter, no search       | Same (query `*` + type=product)   |
| Cache HIT                  | Memory or Redis (no DB)           |
