import { UpstashService } from "@/lib/upstash";

const CACHE_KEY = "sizes:slug_to_size_slugs";
const CACHE_TTL = 7200; // 2 hours, align with sizes options

export type AgeSlugToSizeSlugs = Record<string, string[]>;

/**
 * Returns slug → size_slug[] from cache or DB (sizes table).
 * Uses slug column for filtering; no age_slug. Populate cache via setAgeSlugToSizeSlugsCache (e.g. in sizes options route).
 */
export async function getAgeSlugToSizeSlugs(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase-server").createServerSupabaseClient>>
): Promise<AgeSlugToSizeSlugs> {
  const cached = await UpstashService.get(CACHE_KEY);
  if (cached && typeof cached === "object" && !Array.isArray(cached)) {
    return cached as AgeSlugToSizeSlugs;
  }

  const { data, error } = await supabase
    .from("sizes")
    .select("slug");

  if (error) {
    console.error("Failed to fetch sizes (slug):", error.message);
    return {};
  }

  const map: AgeSlugToSizeSlugs = {};
  for (const row of data ?? []) {
    const slug = String(row.slug ?? "").trim().toLowerCase();
    if (!slug) continue;
    if (!map[slug]) map[slug] = [];
    map[slug].push(slug);
  }

  UpstashService.set(CACHE_KEY, map, CACHE_TTL).catch((err) => {
    console.error("Failed to cache slug_to_size_slugs:", err);
  });

  return map;
}

/**
 * Cache slug → size_slug[] (e.g. after fetching sizes so both stay in sync).
 */
export function setAgeSlugToSizeSlugsCache(map: AgeSlugToSizeSlugs): void {
  UpstashService.set(CACHE_KEY, map, CACHE_TTL).catch((err) => {
    console.error("Failed to cache slug_to_size_slugs:", err);
  });
}
