import { UpstashService } from "@/lib/upstash";

const CACHE_KEY = "sizes:slug_to_size_slugs";
const CACHE_TTL = 7200; // 2 hours, align with sizes options

export type AgeSlugs = string[];

/**
 * Returns all available size slugs from cache or DB (sizes table).
 * Uses slug column for filtering; no age_slug. Populate cache via setAgeSlugsCache (e.g. in sizes options route).
 */
export async function getAvailableAgeSlugs(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase-server").createServerSupabaseClient>>
): Promise<AgeSlugs> {
  const cached = await UpstashService.get(CACHE_KEY);
  if (cached && Array.isArray(cached)) {
    return cached as AgeSlugs;
  }

  const { data, error } = await supabase
    .from("sizes")
    .select("slug");

  if (error) {
    console.error("Failed to fetch sizes (slug):", error.message);
    return [];
  }

  const slugSet = new Set<string>();
  for (const row of data ?? []) {
    const slug = String(row.slug ?? "").trim().toLowerCase();
    if (!slug) continue;
    slugSet.add(slug);
  }

  const slugs = Array.from(slugSet);
  UpstashService.set(CACHE_KEY, slugs, CACHE_TTL).catch((err) => {
    console.error("Failed to cache slug_to_size_slugs:", err);
  });

  return slugs;
}

/**
 * Cache available size slugs (e.g. after fetching sizes so both stay in sync).
 */
export function setAgeSlugsCache(slugs: AgeSlugs): void {
  UpstashService.set(CACHE_KEY, slugs, CACHE_TTL).catch((err) => {
    console.error("Failed to cache slug_to_size_slugs:", err);
  });
}
