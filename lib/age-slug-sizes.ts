import { UpstashService } from "@/lib/upstash";

const CACHE_KEY = "sizes:age_slug_to_slugs";
const CACHE_TTL = 7200; // 2 hours, align with sizes options

export type AgeSlugToSizeSlugs = Record<string, string[]>;

/**
 * Returns age_slug → size_slug[] from cache or DB (sizes table).
 * Populate cache by calling setAgeSlugToSizeSlugsCache() when fetching sizes (e.g. in sizes options route).
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
    .select("age_slug, slug")
    .not("age_slug", "is", null);

  if (error) {
    console.error("Failed to fetch sizes (age_slug, slug):", error.message);
    return {};
  }

  const map: AgeSlugToSizeSlugs = {};
  for (const row of data ?? []) {
    const slug = String(row.age_slug ?? "").trim();
    const sizeSlug = row.slug;
    if (!slug || !sizeSlug) continue;
    if (!map[slug]) map[slug] = [];
    map[slug].push(String(sizeSlug));
  }

  UpstashService.set(CACHE_KEY, map, CACHE_TTL).catch((err) => {
    console.error("Failed to cache age_slug_to_size_slugs:", err);
  });

  return map;
}

/**
 * Cache age_slug → size_slug[] (e.g. after fetching sizes so both stay in sync).
 */
export function setAgeSlugToSizeSlugsCache(map: AgeSlugToSizeSlugs): void {
  UpstashService.set(CACHE_KEY, map, CACHE_TTL).catch((err) => {
    console.error("Failed to cache age_slug_to_size_slugs:", err);
  });
}
