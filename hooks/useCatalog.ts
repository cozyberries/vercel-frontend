"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MIN_QUERY_LENGTH, normalizeQuery, rankingKey } from "@/lib/catalog/filter";
import type { Filters, Snapshot } from "@/lib/catalog/types";

export const CATALOG_QUERY_KEY = ["catalog"] as const;
export const RANKING_QUERY_KEY = "catalog-ranking";
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function fetchCatalog(): Promise<Snapshot> {
  const res = await fetch("/api/catalog", { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`catalog request failed: ${res.status}`);
  return (await res.json()) as Snapshot;
}

/**
 * Never let a refetch move the catalog backwards. The service worker answers `/api/catalog`
 * stale-while-revalidate and the query cache is persisted, so right after a rebuild a fetch can
 * return an older snapshot than the server-rendered one. `generatedAt` is ISO-8601, so string
 * order is time order. Same version keeps the current object (structural sharing, no re-render).
 */
export function newerSnapshot(current: Snapshot | undefined, fetched: Snapshot): Snapshot {
  if (!current) return fetched;
  if (current.version === fetched.version) return current;
  if (!current.generatedAt || !fetched.generatedAt) return fetched;
  return fetched.generatedAt < current.generatedAt ? current : fetched;
}

/**
 * Live catalog snapshot. Starts from the server-rendered copy (no request on mount) and
 * refreshes in the background on focus, on reconnect and every five minutes while visible.
 * An unchanged version produces no re-render thanks to structural sharing.
 */
export function useCatalog(initialSnapshot?: Snapshot) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: CATALOG_QUERY_KEY,
    queryFn: async () => newerSnapshot(queryClient.getQueryData<Snapshot>(CATALOG_QUERY_KEY), await fetchCatalog()),
    initialData: initialSnapshot,
    initialDataUpdatedAt: initialSnapshot ? Date.now() : undefined,
    staleTime: FIVE_MINUTES_MS,
    gcTime: ONE_WEEK_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: FIVE_MINUTES_MS,
    refetchIntervalInBackground: false,
  });
}

export async function fetchRanking(q: string, filters: Filters): Promise<string[] | null> {
  const params = new URLSearchParams({
    q,
    category: filters.category,
    gender: filters.gender,
    size: filters.size,
    age: filters.age,
    design: filters.design,
    featured: String(filters.featured),
  });
  const res = await fetch(`/api/search?${params.toString()}`, { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  const body = (await res.json()) as { slugs: string[] | null };
  return body.slugs;
}

/**
 * Server ranking for a text query. Disabled below MIN_QUERY_LENGTH. `null` data means
 * "no ranking available, match locally". `initial` seeds only the query it was computed for.
 */
export function useRanking(search: string, filters: Filters, initial?: { q: string; slugs: string[] | null }) {
  const q = normalizeQuery(search);
  const enabled = q.length >= MIN_QUERY_LENGTH;
  const seed = enabled && initial && initial.q === q ? initial.slugs : undefined;
  return useQuery({
    queryKey: [RANKING_QUERY_KEY, q, rankingKey(filters)],
    queryFn: () => fetchRanking(q, filters),
    enabled,
    initialData: seed,
    initialDataUpdatedAt: seed !== undefined ? Date.now() : undefined,
    staleTime: FIVE_MINUTES_MS,
    gcTime: 30 * 60 * 1000,
  });
}
