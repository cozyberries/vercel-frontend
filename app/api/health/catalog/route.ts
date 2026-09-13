import { unstable_cache } from "next/cache";
import { CATALOG_TAG } from "@/lib/catalog/cache";
import { hasCronBearer } from "@/lib/catalog/rebuild-handler";
import { catalogStore } from "@/lib/catalog/store";
import type { CatalogMeta } from "@/lib/catalog/types";
import { notifyCatalogAlert } from "@/lib/services/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nightly rebuilds run every day, so a last rebuild older than this means the pipeline is stuck. */
const MAX_REBUILD_AGE_SECONDS = 36 * 60 * 60;

interface HealthInputs {
  hasSnapshot: boolean;
  version: string | null;
  generatedAt: string | null;
  productCount: number;
  meta: CatalogMeta | null;
  indexDocCount: number | null;
}

// Data Cache in front of Redis: however often this public route is hit (or cache-busted),
// Redis is read at most once per minute, and a rebuild refreshes it via the catalog tag.
// Only small derived fields are cached, never the snapshot itself.
const readHealthInputs = unstable_cache(
  async (): Promise<HealthInputs> => {
    const store = catalogStore();
    const [snapshot, meta, indexDocCount] = await Promise.all([store.readSnapshot(), store.readMeta(), store.indexDocCount()]);
    return {
      hasSnapshot: snapshot !== null,
      version: snapshot?.version ?? null,
      generatedAt: snapshot?.generatedAt ?? null,
      productCount: snapshot?.products.length ?? 0,
      meta,
      indexDocCount,
    };
  },
  ["cat:health"],
  { revalidate: 60, tags: [CATALOG_TAG] },
);

export async function GET(req: Request): Promise<Response> {
  try {
    const inputs = await readHealthInputs();
    const lastRebuildAt = inputs.meta?.lastRebuildAt ?? null;
    const ageSeconds = lastRebuildAt ? Math.round((Date.now() - Date.parse(lastRebuildAt)) / 1000) : null;

    const problems: string[] = [];
    if (!inputs.hasSnapshot) problems.push("snapshot missing");
    if (ageSeconds === null) problems.push("no rebuild recorded");
    else if (ageSeconds > MAX_REBUILD_AGE_SECONDS) problems.push(`last rebuild ${Math.round(ageSeconds / 3600)}h ago`);
    if (inputs.indexDocCount !== null && inputs.indexDocCount !== inputs.productCount) {
      problems.push(`index has ${inputs.indexDocCount} docs, snapshot has ${inputs.productCount}`);
    }
    if (inputs.meta && !inputs.meta.ok) problems.push(`last rebuild failed: ${inputs.meta.error ?? "unknown error"}`);

    const body = {
      ok: problems.length === 0,
      version: inputs.version,
      generatedAt: inputs.generatedAt,
      lastRebuildAt,
      ageSeconds,
      productCount: inputs.productCount,
      indexDocCount: inputs.indexDocCount,
      lastRebuild: inputs.meta,
      problems,
    };

    // The Vercel cron calls this daily with the cron bearer; only that caller may trigger alerts.
    if (hasCronBearer(req) && problems.length > 0) {
      notifyCatalogAlert({ title: "Health check failed", details: problems.join("\n") });
    }

    return Response.json(body, {
      status: body.ok ? 200 : 503,
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60" },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
