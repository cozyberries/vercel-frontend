// Request-level logic for /api/catalog/rebuild. Auth is decided by the route file
// (QStash signature or cron bearer); this module parses the scope, takes the lock and runs.
import { rebuild, scopeLabel, type RebuildDeps } from "./rebuild";
import type { CatalogStore } from "./store";
import type { CatalogDb } from "./supabase";
import type { CatalogMeta, Scope } from "./types";

export const LOCK_TTL_MS = 55_000;

export interface RebuildHandlerDeps {
  store: CatalogStore;
  db: CatalogDb;
  revalidate: NonNullable<RebuildDeps["revalidate"]>;
  alert: (data: { title: string; details: string }) => void;
  /** Cron/manual runs alert immediately; QStash runs rely on the failure callback after retries. */
  alertOnFailure: boolean;
}

export function parseScope(body: unknown, searchParams: URLSearchParams): Scope {
  if (searchParams.get("full") === "1") return { kind: "full" };
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (record.kind === "product" && typeof record.slug === "string" && record.slug.trim() !== "") {
      return { kind: "product", slug: record.slug.trim().toLowerCase() };
    }
    if (record.kind === "product-id" && (typeof record.id === "string" || typeof record.id === "number")) {
      return { kind: "product-id", id: String(record.id) };
    }
    if (record.kind === "reference") return { kind: "reference" };
  }
  return { kind: "full" };
}

export function hasCronBearer(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function handleRebuild(req: Request, deps: RebuildHandlerDeps): Promise<Response> {
  const url = new URL(req.url);
  let body: unknown = null;
  if (req.method === "POST") {
    try {
      const text = await req.text();
      body = text ? JSON.parse(text) : null;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  }
  const scope = parseScope(body, url.searchParams);
  const label = scopeLabel(scope);

  const token = await deps.store.acquireLock(LOCK_TTL_MS);
  if (!token) {
    return Response.json({ error: "Rebuild already running", scope: label }, { status: 429, headers: { "Retry-After": "10" } });
  }

  const started = Date.now();
  try {
    const result = await rebuild(scope, { store: deps.store, db: deps.db, revalidate: deps.revalidate });
    return Response.json(
      { ok: true, ...result, scope: scopeLabel(result.scope) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[catalog] rebuild ${label} failed: ${message}`);
    const meta: CatalogMeta = {
      version: null,
      lastRebuildAt: new Date().toISOString(),
      scope: label,
      durationMs: Date.now() - started,
      ok: false,
      error: message,
      productCount: 0,
      indexDocCount: null,
    };
    await deps.store.writeMeta(meta).catch(() => undefined);
    if (deps.alertOnFailure) deps.alert({ title: "Rebuild failed", details: `${label}: ${message}` });
    return Response.json({ ok: false, error: message, scope: label }, { status: 500, headers: { "Cache-Control": "no-store" } });
  } finally {
    await deps.store.releaseLock(token).catch(() => undefined);
  }
}
