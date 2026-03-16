# Upstash Search — Design Document

**Date:** 2026-03-16  
**Status:** Approved  
**Goal:** Replace Supabase `ILIKE` search with a dedicated Upstash Search index for faster, typo-tolerant, relevance-ranked search across products, categories, brands, genders, sizes, collections, and tags.

---

## Problem Statement

The current `/api/search/suggestions` route issues a Supabase `ILIKE '%query%'` query on every unique search term. This has three key limitations:

1. **No typo tolerance** — misspellings return zero results.
2. **Only substring match** — searching "romper" won't find "Cozy Bear Bodysuit" even if that's what the user wants.
3. **Hits the database every time** — Redis caches exact-match repeats for 5 minutes, but every novel query reaches Supabase.

---

## Chosen Approach: Upstash Search (`@upstash/search`)

Upstash offers a managed full-text search service (separate from Redis) with:

- Native typo tolerance and prefix matching
- Relevance scoring
- Fast reads without touching Supabase at query time
- Clean SDK that integrates alongside the existing `lib/upstash.ts`

---

## Architecture

```
User types in search box
        ↓
GET /api/search/suggestions?q=...
        ↓
  Redis cache hit? → return immediately (60s TTL, burst dedup)
        ↓ (miss)
  Upstash Search.query(term, { limit: 8 })
        ↓
  Format results (products first, then categories/brands/etc.)
        ↓
  Store in Redis cache (60s TTL)
        ↓
  Return { suggestions: [...] }
```

Supabase is **not touched at query time**. The index is populated nightly via a Vercel cron job.

---

## Index Document Shape

Every entity is stored as a flat document with a namespaced `id`:

```ts
interface SearchDocument {
  id: string;          // e.g. "product:cozy-bear-romper", "category:rompers"
  type: "product" | "category" | "brand" | "gender" | "size" | "collection" | "tag";
  name: string;        // primary searchable field
  description?: string; // products only
  slug: string;        // for client-side navigation
  image?: string;      // products + categories (Cloudinary URL)
  category?: string;   // products only — shown in result UI
  tags?: string[];     // products only
}
```

**Searchable fields configured in Upstash Search:** `name`, `description`, `category`, `tags`.

---

## New Files

| Path | Purpose |
|---|---|
| `lib/services/search-client.ts` | Wraps `@upstash/search` — exports `indexDocuments()` and `querySearch()` |
| `app/api/cron/reindex-search/route.ts` | Nightly full re-index cron handler |

## Modified Files

| Path | Change |
|---|---|
| `app/api/search/suggestions/route.ts` | Replace Supabase ILIKE with `querySearch()` from search-client |
| `vercel.json` | Add cron entry for `/api/cron/reindex-search` at `30 21 * * *` |
| `.env.local` (and Vercel env) | Add `UPSTASH_SEARCH_REST_URL`, `UPSTASH_SEARCH_REST_TOKEN` |

---

## Sync Strategy

**Nightly full re-index** via Vercel cron:

1. Vercel calls `POST /api/cron/reindex-search` at `30 21 * * *` UTC (1 hour after existing cache warm).
2. Route verifies `Authorization: Bearer ${CRON_SECRET}` (Vercel sets this automatically).
3. Fetches all entity types from Supabase in **parallel** (`Promise.all`):
   - Products (slug, name, description, category, images, tags, features)
   - Categories (slug, name)
   - Brands (slug, name) — if `brands` table exists, else skip
   - Genders (slug, name)
   - Sizes (slug, name)
   - Collections + Tags — from product metadata
4. Upserts all documents into Upstash Search in batches of 100.
5. Returns `{ indexed: { products: N, categories: N, ... }, durationMs: N }`.

No incremental sync in this phase. Nightly is sufficient given moderate catalog change frequency.

---

## Search API Response

Response shape is **unchanged** from today so no frontend changes are needed:

```ts
{
  suggestions: Array<{
    id: string;
    name: string;
    type: "product" | "category" | "brand" | "gender" | "size" | "collection" | "tag";
    slug: string;
    image?: string;
    categoryName?: string;
  }>
}
```

Result mix: up to **5 products** + up to **3 others** (categories/brands/genders), sorted by Upstash Search relevance score.

---

## Environment Variables Required

```
UPSTASH_SEARCH_REST_URL=https://...upstash.io
UPSTASH_SEARCH_REST_TOKEN=...
CRON_SECRET=...   # already used by existing cron route
```

---

## Out of Scope (Future)

- Incremental sync on product create/update (Supabase webhooks → reindex single document)
- Semantic / vector search
- Search analytics (popular queries, zero-result queries)
- A/B testing relevance tuning
