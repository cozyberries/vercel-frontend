import { hasCronBearer } from "@/lib/catalog/rebuild-handler";
import { catalogStore } from "@/lib/catalog/store";
import { notifyCatalogAlert } from "@/lib/services/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nightly rebuilds run every day, so a last rebuild older than this means the pipeline is stuck. */
const MAX_REBUILD_AGE_SECONDS = 36 * 60 * 60;

export async function GET(req: Request): Promise<Response> {
  const store = catalogStore();
  try {
    const [snapshot, meta, indexDocCount] = await Promise.all([store.readSnapshot(), store.readMeta(), store.indexDocCount()]);
    const lastRebuildAt = meta?.lastRebuildAt ?? null;
    const ageSeconds = lastRebuildAt ? Math.round((Date.now() - Date.parse(lastRebuildAt)) / 1000) : null;
    const productCount = snapshot?.products.length ?? 0;

    const problems: string[] = [];
    if (!snapshot) problems.push("snapshot missing");
    if (ageSeconds === null) problems.push("no rebuild recorded");
    else if (ageSeconds > MAX_REBUILD_AGE_SECONDS) problems.push(`last rebuild ${Math.round(ageSeconds / 3600)}h ago`);
    if (indexDocCount !== null && indexDocCount !== productCount) problems.push(`index has ${indexDocCount} docs, snapshot has ${productCount}`);
    if (meta && !meta.ok) problems.push(`last rebuild failed: ${meta.error ?? "unknown error"}`);

    const body = {
      ok: problems.length === 0,
      version: snapshot?.version ?? null,
      generatedAt: snapshot?.generatedAt ?? null,
      lastRebuildAt,
      ageSeconds,
      productCount,
      indexDocCount,
      lastRebuild: meta,
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
