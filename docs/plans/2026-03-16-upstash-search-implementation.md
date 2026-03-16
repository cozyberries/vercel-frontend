# Upstash Search Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Supabase `ILIKE` search with a dedicated Upstash Search index that delivers typo-tolerant, prefix-matched, relevance-ranked results across products, categories, genders, and sizes — without hitting Supabase at query time.

**Architecture:** A new `lib/services/search-client.ts` wraps `@upstash/search` SDK, exposing `indexDocuments()` and `querySearch()`. A nightly Vercel cron at `/api/cron/reindex-search` does a full re-index from Supabase. The existing `/api/search/suggestions` route is updated to query Upstash Search instead of Supabase ILIKE. Redis cache stays as a 60s burst deduplication layer.

**Tech Stack:** Next.js 15 App Router, `@upstash/search` SDK, `@upstash/redis` (existing), Supabase (source of truth for data), Vercel Cron.

**Design doc:** `docs/plans/2026-03-16-upstash-search-design.md`

---

## Pre-requisites (do before Task 1)

1. Go to [console.upstash.com](https://console.upstash.com), create a new **Search** index (not Redis — it's a separate product). Name it `cozyburry-search`.
2. Copy the `REST URL` and `REST Token` from the index dashboard.
3. Add to `.env.local`:
   ```
   UPSTASH_SEARCH_REST_URL=https://your-index.upstash.io
   UPSTASH_SEARCH_REST_TOKEN=your_token_here
   ```
4. Add the same two vars to your Vercel project environment variables.

---

## Task 1: Install `@upstash/search` and create the search client

**Files:**
- Create: `lib/services/search-client.ts`

**Step 1: Install the package**

```bash
npm install @upstash/search
```

Expected: package added to `node_modules` and `package.json` dependencies.

**Step 2: Create `lib/services/search-client.ts`**

```typescript
import 'server-only';
import { Index } from '@upstash/search';

export interface SearchDocument {
  id: string;
  type: 'product' | 'category' | 'gender' | 'size';
  name: string;
  description?: string;
  slug: string;
  image?: string;
  category?: string;
}

export interface SearchSuggestion {
  id: string;
  name: string;
  type: SearchDocument['type'];
  slug: string;
  image?: string;
  categoryName?: string;
}

/** Singleton Upstash Search client. Only instantiated server-side. */
function getSearchIndex(): Index<SearchDocument> {
  const url = process.env.UPSTASH_SEARCH_REST_URL;
  const token = process.env.UPSTASH_SEARCH_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      'UPSTASH_SEARCH_REST_URL and UPSTASH_SEARCH_REST_TOKEN must be set.'
    );
  }

  return new Index<SearchDocument>({ url, token });
}

/**
 * Upsert documents into the Upstash Search index in batches.
 * Returns the total count of indexed documents.
 */
export async function indexDocuments(
  documents: SearchDocument[],
  batchSize = 100
): Promise<number> {
  if (documents.length === 0) return 0;

  const index = getSearchIndex();
  let total = 0;

  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize);
    await index.upsert(batch);
    total += batch.length;
  }

  return total;
}

/**
 * Query Upstash Search and return formatted suggestions.
 * Products appear first, then other types.
 *
 * @param query - Raw search term from user input (min 2 chars enforced by caller)
 * @param limit - Total max results (default 8: up to 5 products + 3 others)
 */
export async function querySearch(
  query: string,
  limit = 8
): Promise<SearchSuggestion[]> {
  const index = getSearchIndex();

  const results = await index.query({
    query,
    topK: limit,
  });

  const suggestions: SearchSuggestion[] = results.map((result) => ({
    id: result.id,
    name: result.data.name,
    type: result.data.type,
    slug: result.data.slug,
    image: result.data.image,
    categoryName: result.data.category,
  }));

  // Products first, then everything else (stable sort preserves relevance within each group)
  suggestions.sort((a, b) => {
    if (a.type === 'product' && b.type !== 'product') return -1;
    if (a.type !== 'product' && b.type === 'product') return 1;
    return 0;
  });

  return suggestions;
}

/** Returns true when Upstash Search env vars are set. */
export function isSearchConfigured(): boolean {
  return (
    typeof process.env.UPSTASH_SEARCH_REST_URL === 'string' &&
    process.env.UPSTASH_SEARCH_REST_URL.length > 0 &&
    typeof process.env.UPSTASH_SEARCH_REST_TOKEN === 'string' &&
    process.env.UPSTASH_SEARCH_REST_TOKEN.length > 0
  );
}
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 4: Commit**

```bash
git add lib/services/search-client.ts package.json package-lock.json
git commit -m "feat: add Upstash Search client service"
```

---

## Task 2: Create the nightly re-index cron route

**Files:**
- Create: `app/api/cron/reindex-search/route.ts`
- Modify: `vercel.json`

**Step 1: Create `app/api/cron/reindex-search/route.ts`**

This route mirrors the auth pattern from `app/api/cache/warm/route.ts`. It fetches all entities from Supabase in parallel and upserts them into Upstash Search.

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { indexDocuments, isSearchConfigured, SearchDocument } from '@/lib/services/search-client';

function extractPrimaryImage(productImages: any[]): string | undefined {
  const sorted = [...(productImages || [])].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
  );
  const primary = sorted.find((img) => img.is_primary) ?? sorted[0];
  return primary?.url ?? undefined;
}

async function buildDocuments(supabase: ReturnType<typeof createServerSupabaseClient> extends Promise<infer T> ? T : never): Promise<{
  documents: SearchDocument[];
  counts: Record<string, number>;
}> {
  const [productsResult, categoriesResult, gendersResult, sizesResult] =
    await Promise.all([
      supabase
        .from('products')
        .select(
          'slug, name, description, category_slug, categories(name, slug), product_images(url, is_primary, display_order), product_features(feature)'
        )
        .order('created_at', { ascending: false }),
      supabase
        .from('categories')
        .select('slug, name, image')
        .eq('display', true),
      supabase.from('genders').select('slug, name'),
      supabase
        .from('sizes')
        .select('slug, name')
        .order('display_order', { ascending: true }),
    ]);

  const documents: SearchDocument[] = [];
  const counts: Record<string, number> = {
    products: 0,
    categories: 0,
    genders: 0,
    sizes: 0,
  };

  // Products
  for (const product of productsResult.data ?? []) {
    const categoryName = Array.isArray(product.categories)
      ? product.categories[0]?.name
      : (product.categories as any)?.name;

    const features = (product.product_features ?? [])
      .map((f: any) => f.feature)
      .filter(Boolean)
      .join(' ');

    documents.push({
      id: `product:${product.slug}`,
      type: 'product',
      name: product.name ?? '',
      description: [product.description, features].filter(Boolean).join(' '),
      slug: product.slug,
      image: extractPrimaryImage(product.product_images ?? []),
      category: categoryName,
    });
    counts.products++;
  }

  // Categories
  for (const category of categoriesResult.data ?? []) {
    documents.push({
      id: `category:${category.slug}`,
      type: 'category',
      name: category.name ?? '',
      slug: category.slug,
      image: category.image ?? undefined,
    });
    counts.categories++;
  }

  // Genders
  for (const gender of gendersResult.data ?? []) {
    documents.push({
      id: `gender:${gender.slug}`,
      type: 'gender',
      name: gender.name ?? '',
      slug: gender.slug,
    });
    counts.genders++;
  }

  // Sizes
  for (const size of sizesResult.data ?? []) {
    documents.push({
      id: `size:${size.slug}`,
      type: 'size',
      name: size.name ?? '',
      slug: size.slug,
    });
    counts.sizes++;
  }

  return { documents, counts };
}

async function runReindex() {
  const supabase = await createServerSupabaseClient();
  const start = Date.now();

  const { documents, counts } = await buildDocuments(supabase);
  await indexDocuments(documents);

  return { counts, total: documents.length, durationMs: Date.now() - start };
}

/** GET — called by Vercel cron daily at 21:30 UTC. Secured with CRON_SECRET. */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret === undefined) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else {
    if (cronSecret === '') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  if (!isSearchConfigured()) {
    return NextResponse.json(
      { error: 'Upstash Search not configured. Set UPSTASH_SEARCH_REST_URL and UPSTASH_SEARCH_REST_TOKEN.' },
      { status: 503 }
    );
  }

  try {
    const result = await runReindex();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[reindex-search] Failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/** POST — manual trigger (no CRON_SECRET required; use only in development or admin flows). */
export async function POST() {
  if (!isSearchConfigured()) {
    return NextResponse.json(
      { error: 'Upstash Search not configured.' },
      { status: 503 }
    );
  }

  try {
    const result = await runReindex();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[reindex-search] Failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
```

**Step 2: Add cron entry to `vercel.json`**

Open `vercel.json` and add a second cron entry (after the existing cache warm entry):

```json
{
  "version": 2,
  "buildCommand": "next build",
  "devCommand": "next dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "crons": [
    {
      "path": "/api/cache/warm",
      "schedule": "30 20 * * *"
    },
    {
      "path": "/api/cron/reindex-search",
      "schedule": "30 21 * * *"
    }
  ]
}
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 4: Trigger a manual re-index to populate the index for the first time**

With the dev server running (`npm run dev`):

```bash
curl -X POST http://localhost:3000/api/cron/reindex-search
```

Expected response:
```json
{
  "success": true,
  "counts": { "products": N, "categories": N, "genders": N, "sizes": N },
  "total": N,
  "durationMs": N
}
```

Verify documents appear in the Upstash console Search index browser.

**Step 5: Commit**

```bash
git add app/api/cron/reindex-search/route.ts vercel.json
git commit -m "feat: add nightly reindex-search cron route"
```

---

## Task 3: Update the search suggestions route to use Upstash Search

**Files:**
- Modify: `app/api/search/suggestions/route.ts`

**Step 1: Replace the entire route with the new implementation**

The response shape is **identical** to today, so no frontend changes are needed.

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { UpstashService } from '@/lib/upstash';
import { querySearch, isSearchConfigured } from '@/lib/services/search-client';
import { createServerSupabaseClient } from '@/lib/supabase-server';

/** Fallback: Supabase ILIKE query used when Upstash Search is not configured. */
async function supabaseFallbackSearch(normalised: string) {
  const supabase = await createServerSupabaseClient();

  const escaped = normalised
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');

  const [productsResult, categoriesResult] = await Promise.all([
    supabase
      .from('products')
      .select(
        'slug, name, category_slug, categories(name, slug), product_images(url, is_primary, display_order)'
      )
      .ilike('name', `%${escaped}%`)
      .limit(5),
    supabase
      .from('categories')
      .select('slug, name')
      .ilike('name', `%${escaped}%`)
      .limit(3),
  ]);

  const suggestions = [];

  for (const product of productsResult.data ?? []) {
    const sorted = [...(product.product_images || [])].sort(
      (a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0)
    );
    const primary = sorted.find((img: any) => img.is_primary) ?? sorted[0];

    suggestions.push({
      id: product.slug,
      name: product.name,
      type: 'product' as const,
      slug: product.slug,
      image: primary?.url ?? undefined,
      categoryName: Array.isArray(product.categories)
        ? product.categories[0]?.name
        : (product.categories as any)?.name,
    });
  }

  for (const category of categoriesResult.data ?? []) {
    suggestions.push({
      id: category.slug,
      name: category.name,
      type: 'category' as const,
      slug: category.slug,
    });
  }

  return suggestions;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query || query.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const normalised = query.trim().toLowerCase();
  const cacheKey = `search:suggestions:${normalised}`;

  // 1. Redis cache — 60s TTL for burst deduplication
  const cached = await UpstashService.get(cacheKey).catch(() => null);
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        'X-Cache-Status': 'HIT',
        'X-Data-Source': 'REDIS_CACHE',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  }

  try {
    let suggestions;
    let dataSource: string;

    if (isSearchConfigured()) {
      // 2a. Upstash Search (primary path)
      suggestions = await querySearch(normalised, 8);
      dataSource = 'UPSTASH_SEARCH';
    } else {
      // 2b. Supabase ILIKE fallback (dev without Upstash Search configured)
      suggestions = await supabaseFallbackSearch(normalised);
      dataSource = 'SUPABASE_FALLBACK';
    }

    const response = { suggestions };

    // 3. Cache in Redis for 60s
    UpstashService.set(cacheKey, response, 60).catch(() => {});

    return NextResponse.json(response, {
      headers: {
        'X-Cache-Status': 'MISS',
        'X-Data-Source': dataSource,
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    console.error('[search/suggestions] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Run the linter**

```bash
npm run lint
```

Expected: no new errors introduced.

**Step 4: Smoke test locally**

With dev server running and the index populated (from Task 2 Step 4):

```bash
curl "http://localhost:3000/api/search/suggestions?q=cozy"
```

Expected: JSON with `suggestions` array, `X-Data-Source: UPSTASH_SEARCH` header.

Try a typo:
```bash
curl "http://localhost:3000/api/search/suggestions?q=cozzy"
```

Expected: still returns results (typo tolerance working).

**Step 5: Commit**

```bash
git add app/api/search/suggestions/route.ts
git commit -m "feat: use Upstash Search for suggestions, Supabase ILIKE as fallback"
```

---

## Task 4: Update SearchDocument type for brands/collections/tags (future-proofing)

**Files:**
- Modify: `lib/services/search-client.ts` (only the type union)

If your database has `brands`, `collections`, or `tags` tables, extend the `type` union in `SearchDocument`:

```typescript
type: 'product' | 'category' | 'gender' | 'size' | 'brand' | 'collection' | 'tag';
```

Also add the corresponding fetch + document mapping blocks inside `buildDocuments()` in `app/api/cron/reindex-search/route.ts` — follow the same pattern as the existing `genders` block.

This task is **optional** until those tables exist in your Supabase schema. Skip if not applicable.

**Step 1: Commit (if changes made)**

```bash
git add lib/services/search-client.ts app/api/cron/reindex-search/route.ts
git commit -m "feat: extend search index types for brand/collection/tag entities"
```

---

## Post-deployment checklist

- [ ] `UPSTASH_SEARCH_REST_URL` and `UPSTASH_SEARCH_REST_TOKEN` added to Vercel production environment
- [ ] After first deploy, trigger a manual re-index via Vercel dashboard or:
  ```bash
  curl -X POST https://cozyburry.vercel.app/api/cron/reindex-search
  ```
- [ ] Confirm `X-Data-Source: UPSTASH_SEARCH` header in production search responses
- [ ] Verify Vercel cron at `/api/cron/reindex-search` shows in the Vercel dashboard under Cron Jobs
