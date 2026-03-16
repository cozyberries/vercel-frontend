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

const INDEX_NAME = 'catalog';

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

/** Returns true when Upstash Search env vars are set. */
export function isSearchConfigured(): boolean {
  return (
    typeof process.env.UPSTASH_SEARCH_REST_URL === 'string' &&
    process.env.UPSTASH_SEARCH_REST_URL.length > 0 &&
    typeof process.env.UPSTASH_SEARCH_REST_TOKEN === 'string' &&
    process.env.UPSTASH_SEARCH_REST_TOKEN.length > 0
  );
}
