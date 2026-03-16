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

  const normalised = (query ?? '').trim().toLowerCase();
  if (normalised.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

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
      // 2a. Upstash Search — primary path
      suggestions = await querySearch(normalised, 8);
      dataSource = 'UPSTASH_SEARCH';
    } else {
      // 2b. Supabase ILIKE fallback — dev without Upstash Search configured
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
