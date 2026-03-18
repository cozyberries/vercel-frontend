import 'server-only';
import { Search } from '@upstash/search';

export interface SearchDocument {
  id: string;
  type: 'product' | 'category' | 'gender' | 'size';
  name: string;
  description?: string;
  slug: string;
  image?: string;
  category?: string;
  /** Product-only: for filtering/sorting product list from search DB */
  category_slug?: string;
  gender_slug?: string;
  size_slugs?: string[];
  price?: number;
  created_at?: string;
  is_featured?: boolean;
}

type SearchDocumentContent = Omit<SearchDocument, 'id'>;

export interface SearchSuggestion {
  id: string;
  name: string;
  type: SearchDocument['type'];
  slug: string;
  image?: string;
  categoryName?: string;
}

/** Must match the index name in Upstash console (e.g. cozyburry-search). */
const INDEX_NAME = 'cozyburry-search';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _searchIndex: any = null;

/** Lazily initialised module-level singleton — avoids recreating the client on every call. */
function getSearchIndex() {
  if (_searchIndex) return _searchIndex;

  const url = process.env.UPSTASH_SEARCH_REST_URL;
  const token = process.env.UPSTASH_SEARCH_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      'UPSTASH_SEARCH_REST_URL and UPSTASH_SEARCH_REST_TOKEN must be set.'
    );
  }

  _searchIndex = new Search({ url, token }).index<SearchDocumentContent>(INDEX_NAME);
  return _searchIndex;
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
    await index.upsert(
      batch.map(({ id, ...content }) => ({ id, content }))
    );
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

  const results = (await index.search({ query, limit })) as Array<{
    id: string;
    content: SearchDocumentContent;
  }>;

  const suggestions: SearchSuggestion[] = results.map((result) => ({
    id: result.id,
    name: result.content.name,
    type: result.content.type,
    slug: result.content.slug,
    image: result.content.image,
    categoryName: result.content.category,
  }));

  // Products first, then everything else (stable sort preserves relevance within each group)
  suggestions.sort((a, b) => {
    if (a.type === 'product' && b.type !== 'product') return -1;
    if (a.type !== 'product' && b.type === 'product') return 1;
    return 0;
  });

  return suggestions;
}

/** Params for product list query — filters and pagination. */
export interface ProductListSearchParams {
  search?: string | null;
  category?: string | null;
  gender?: string | null;
  size?: string | null;
  age?: string | null;
  featured?: boolean;
  limit?: number;
}

const PRODUCT_LIST_MAX_RESULTS = 500;

/**
 * Query Upstash Search for product slugs (and optional sort fields) for listing.
 * Used by GET /api/products so listing and filters come from cache or search DB only.
 * Returns up to PRODUCT_LIST_MAX_RESULTS slugs; caller paginates and enriches from Supabase.
 */
export async function queryProductSlugs(
  params: ProductListSearchParams
): Promise<{ slugs: string[] }> {
  const index = getSearchIndex();
  const {
    search,
    category,
    gender,
    size,
    age,
    featured,
    limit = PRODUCT_LIST_MAX_RESULTS,
  } = params;

  const clauses: Record<string, unknown>[] = [{ type: { equals: 'product' } }];

  if (featured === true) {
    clauses.push({ is_featured: { equals: true } });
  }

  if (category && category !== 'all') {
    clauses.push({ category_slug: { equals: category.trim().toLowerCase() } });
  }

  if (gender && gender !== 'all') {
    const normalized = gender.trim().toLowerCase();
    const genderSlugs =
      /^boy(s)?$/.test(normalized)
        ? ['boy', 'unisex']
        : /^girl(s)?$/.test(normalized)
          ? ['girl', 'unisex']
          : [normalized];
    if (genderSlugs.length === 1) {
      clauses.push({ gender_slug: { equals: genderSlugs[0] } });
    } else {
      clauses.push({
        OR: genderSlugs.map((slug) => ({ gender_slug: { equals: slug } })),
      });
    }
  }

  if (size) {
    clauses.push({
      size_slugs: { contains: size.trim().toLowerCase() },
    });
  }

  if (age) {
    const ageSlug = age.trim().toLowerCase();
    const is3To6 = ageSlug === '3-6y' || ageSlug === '3-6-years';
    if (is3To6) {
      clauses.push({
        OR: ['3-4y', '4-5y', '5-6y'].map((s) => ({
          size_slugs: { contains: s },
        })),
      });
    } else {
      clauses.push({
        size_slugs: { contains: ageSlug },
      });
    }
  }

  // When no search term, use a broad query that matches most product documents so filter-only requests succeed
  const queryText = search?.trim() || 'a';
  const filter = clauses.length > 0 ? { AND: clauses } : undefined;

  const results = (await index.search({
    query: queryText,
    limit: Math.min(limit, PRODUCT_LIST_MAX_RESULTS),
    filter,
  })) as Array<{ id: string; content: SearchDocumentContent }>;

  const slugs = results
    .filter((r) => r.id.startsWith('product:'))
    .map((r) => r.id.replace(/^product:/, ''));

  return { slugs };
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
