import { NextRequest, NextResponse } from 'next/server';
import { UpstashService } from '@/lib/upstash';
import { querySearch, isSearchConfigured } from '@/lib/services/search-client';
import { createServerSupabaseClient } from '@/lib/supabase-server';

/** Fallback: Supabase ILIKE used when Upstash Search is not configured. */
async function supabaseFallbackSearch(normalised: string) {
  const supabase = await createServerSupabaseClient();

  const escaped = normalised
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');

  const [productsResult, categoriesResult] = await Promise.all([
    supabase
      .from('products')
      .select('slug, name, category_slug, categories(name, slug), product_images(url, is_primary, display_order)')
      .ilike('name', `%${escaped}%`)
      .limit(5),
    supabase
      .from('categories')
      .select('slug, name')
      .ilike('name', `%${escaped}%`)
      .limit(3),
  ]);

  if (productsResult.error) {
    console.error('[search/suggestions] Supabase products error:', productsResult.error);
  }
  if (categoriesResult.error) {
    console.error('[search/suggestions] Supabase categories error:', categoriesResult.error);
  }

  if (productsResult.error && categoriesResult.error) {
    return [];
  }

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

const REDIS_CACHE_TIMEOUT_MS = 1500;
const SEARCH_TIMEOUT_MS = 4000;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function rejectAfter(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
  );
}

export async function GET(request: NextRequest) {
  const start = Date.now();
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  const normalised = (query ?? '').trim().toLowerCase();
  if (normalised.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const cacheKey = `search:suggestions:${normalised}`;

  // 1. Redis cache — 60s TTL; short timeout so slow Redis doesn't block (treat as miss)
  const cacheStart = Date.now();
  const cached = await withTimeout(
    UpstashService.get(cacheKey).catch(() => null),
    REDIS_CACHE_TIMEOUT_MS,
    null
  );
  const cacheMs = Date.now() - cacheStart;

  if (cached) {
    const totalMs = Date.now() - start;
    return NextResponse.json(cached, {
      headers: {
        'X-Cache-Status': 'HIT',
        'X-Data-Source': 'REDIS_CACHE',
        'X-Cache-Check-Ms': String(cacheMs),
        'X-Response-Time-Ms': String(totalMs),
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  }

  try {
    const searchStart = Date.now();

    const searchPromise = isSearchConfigured()
      ? querySearch(normalised, 8).then((s) => ({ s, dataSource: 'UPSTASH_SEARCH' as const }))
      : supabaseFallbackSearch(normalised).then((s) => ({ s, dataSource: 'SUPABASE_FALLBACK' as const }));

    const result = await Promise.race([
      searchPromise,
      rejectAfter(SEARCH_TIMEOUT_MS),
    ]).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Timeout')) {
        console.warn('[search/suggestions] Search timed out:', normalised);
        return { s: [], dataSource: 'TIMEOUT' as const };
      }
      throw err;
    });

    const suggestions = result.s;
    const dataSource = result.dataSource;

    const searchMs = Date.now() - searchStart;
    const totalMs = Date.now() - start;
    const response = { suggestions };

    // 3. Cache in Redis for 60s (fire-and-forget)
    UpstashService.set(cacheKey, response, 60).catch(() => {});

    return NextResponse.json(response, {
      headers: {
        'X-Cache-Status': 'MISS',
        'X-Data-Source': dataSource,
        'X-Cache-Check-Ms': String(cacheMs),
        'X-Search-Ms': String(searchMs),
        'X-Response-Time-Ms': String(totalMs),
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
