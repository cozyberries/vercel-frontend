// Rebuilds catalog documents for a scope. Called by /api/catalog/rebuild (QStash) and by
// the nightly schedule. Idempotent: identical content yields an identical version.
import { buildProductDoc, buildReference, buildSnapshot, computeRatingSummaries, mergeCards, toListCard } from "./build";
import type { CatalogStore } from "./store";
import type { CatalogDb } from "./supabase";
import type { CatalogMeta, Scope } from "./types";

export interface RebuildDeps {
  store: CatalogStore;
  db: CatalogDb;
  now?: () => Date;
  revalidate?: (args: { slugs: string[]; versionChanged: boolean }) => Promise<void>;
}

export interface RebuildResult {
  scope: Scope;
  version: string;
  changed: boolean;
  productCount: number;
  durationMs: number;
  touchedSlugs: string[];
}

export function scopeLabel(scope: Scope): string {
  switch (scope.kind) {
    case "product":
      return `product:${scope.slug}`;
    case "product-id":
      return `product-id:${scope.id}`;
    default:
      return scope.kind;
  }
}

export async function rebuild(scope: Scope, deps: RebuildDeps): Promise<RebuildResult> {
  const now = deps.now ?? (() => new Date());
  const started = Date.now();
  const { store, db } = deps;

  let effective: Scope = scope;
  if (effective.kind === "product-id") {
    const slug = await db.resolveProductSlugById(effective.id);
    effective = slug ? { kind: "product", slug } : { kind: "full" };
  }
  if (effective.kind === "reference") effective = { kind: "full" };

  const previous = await store.readSnapshot();
  if (effective.kind === "product" && !previous) effective = { kind: "full" };
  const isFull = effective.kind === "full";

  // Reference names are denormalised into documents, so a full rebuild always refreshes it.
  let referenceFromDb = false;
  let reference = isFull ? null : await store.readReference();
  if (!reference) {
    reference = buildReference(await db.fetchReferenceRows());
    referenceFromDb = true;
  }

  const slugs = effective.kind === "product" ? [effective.slug] : undefined;
  const [rows, ratingRows] = await Promise.all([db.fetchProductRows(slugs), db.fetchRatingRows(slugs)]);
  const ratings = computeRatingSummaries(ratingRows);
  const docs = rows.map((row) => buildProductDoc(row, { reference: reference!, ratings }));
  const currentSlugs = new Set(docs.map((doc) => doc.slug));

  const deleteSlugs =
    effective.kind === "product"
      ? currentSlugs.has(effective.slug) ? [] : [effective.slug]
      : (previous?.products.map((card) => card.slug) ?? []).filter((slug) => !currentSlugs.has(slug));

  const cards = docs.map(toListCard);
  const merged = effective.kind === "product" && previous ? mergeCards(previous.products, cards, deleteSlugs) : cards;
  const { snapshot, changed } = buildSnapshot(merged, reference, previous, now());

  // Idempotent (existsOk) and one command: a dropped index heals on the next rebuild of any scope.
  await store.ensureIndex();

  const meta: CatalogMeta = {
    version: snapshot.version,
    lastRebuildAt: now().toISOString(),
    scope: scopeLabel(scope),
    durationMs: 0,
    ok: true,
    productCount: snapshot.products.length,
    indexDocCount: null,
  };

  await store.writeCatalog({
    docs,
    deleteSlugs,
    reference: referenceFromDb ? reference : undefined,
    snapshot: changed ? snapshot : undefined,
    meta,
  });
  await store.waitIndexing();

  meta.indexDocCount = await store.indexDocCount();
  meta.durationMs = Date.now() - started;
  await store.writeMeta(meta);

  const touchedSlugs = [...docs.map((doc) => doc.slug), ...deleteSlugs];
  if (deps.revalidate) await deps.revalidate({ slugs: touchedSlugs, versionChanged: changed });

  return {
    scope: effective,
    version: snapshot.version,
    changed,
    productCount: snapshot.products.length,
    durationMs: meta.durationMs,
    touchedSlugs,
  };
}
