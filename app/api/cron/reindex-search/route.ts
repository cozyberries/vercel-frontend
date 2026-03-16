import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { indexDocuments, isSearchConfigured, SearchDocument } from '@/lib/services/search-client';

function extractPrimaryImage(productImages: Array<{ url?: string; is_primary?: boolean; display_order?: number }>): string | undefined {
  const sorted = [...productImages].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
  );
  const primary = sorted.find((img) => img.is_primary) ?? sorted[0];
  return primary?.url ?? undefined;
}

async function buildDocuments(supabase: any): Promise<{
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

  if (productsResult.error) throw new Error(`[reindex-search] products: ${productsResult.error.message}`);
  if (categoriesResult.error) throw new Error(`[reindex-search] categories: ${categoriesResult.error.message}`);
  if (gendersResult.error) throw new Error(`[reindex-search] genders: ${gendersResult.error.message}`);
  if (sizesResult.error) throw new Error(`[reindex-search] sizes: ${sizesResult.error.message}`);

  const documents: SearchDocument[] = [];
  const counts: Record<string, number> = {
    products: 0,
    categories: 0,
    genders: 0,
    sizes: 0,
  };

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

  for (const gender of gendersResult.data ?? []) {
    documents.push({
      id: `gender:${gender.slug}`,
      type: 'gender',
      name: gender.name ?? '',
      slug: gender.slug,
    });
    counts.genders++;
  }

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
      {
        error:
          'Upstash Search not configured. Set UPSTASH_SEARCH_REST_URL and UPSTASH_SEARCH_REST_TOKEN.',
      },
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

/** POST — manual trigger for development and admin use. Requires CRON_SECRET when configured. */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
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
