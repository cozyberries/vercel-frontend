import ProductsClient from "./ProductsClient";
import { getRanking, getSnapshot } from "@/lib/catalog/cache";
import { MIN_QUERY_LENGTH, normalizeQuery, parseFilters } from "@/lib/catalog/filter";

type SearchParams = Record<string, string | string[] | undefined>;

// Reads searchParams, so it renders per request (in bom1) with the correct filtered grid in the HTML.
export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const { snapshot } = await getSnapshot();
  const q = normalizeQuery(filters.search);
  const initialRanking = q.length >= MIN_QUERY_LENGTH ? { q, slugs: await getRanking(q, filters) } : null;

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Visually hidden — design has no visible page title, but keep an h1 for SEO/a11y */}
      <h1 className="sr-only">Our Products</h1>
      <ProductsClient snapshot={snapshot} initialRanking={initialRanking} />
    </div>
  );
}
