// Turns Supabase change notifications into at most one QStash rebuild message per scope
// per 8 seconds, and collapses bursts (CSV imports) into a single full rebuild.
import { scopeLabel } from "./rebuild";
import { KEYS, type CatalogStore } from "./store";
import type { Scope } from "./types";

export const DEBOUNCE_SECONDS = 8;
export const BURST_THRESHOLD = 15;
export const BURST_WINDOW_SECONDS = 60;
export const MUTE_SECONDS = 60;
export const REBUILD_RETRIES = 3;

export interface EventPayload {
  table?: string;
  type?: string;
  at?: string;
  id?: string | number | null;
  slug?: string | null;
  old_slug?: string | null;
  product_slug?: string | null;
  product_id?: string | number | null;
}

const PRODUCT_TABLES = new Set(["products"]);
const PRODUCT_CHILD_TABLES = new Set(["product_variants", "product_images", "product_features", "ratings"]);
const REFERENCE_TABLES = new Set(["categories", "sizes", "genders", "colors"]);

function cleanSlug(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function deriveScopes(payload: EventPayload): Scope[] {
  const table = String(payload.table ?? "").toLowerCase();
  const slug = cleanSlug(payload.slug);
  const oldSlug = cleanSlug(payload.old_slug);
  const productSlug = cleanSlug(payload.product_slug);
  const productId = payload.product_id === null || payload.product_id === undefined ? "" : String(payload.product_id);

  if (PRODUCT_TABLES.has(table)) {
    const scopes: Scope[] = [];
    if (slug) scopes.push({ kind: "product", slug });
    if (oldSlug && oldSlug !== slug) scopes.push({ kind: "product", slug: oldSlug });
    return scopes.length > 0 ? scopes : [{ kind: "full" }];
  }
  if (PRODUCT_CHILD_TABLES.has(table)) {
    if (productSlug) return [{ kind: "product", slug: productSlug }];
    if (productId) return [{ kind: "product-id", id: productId }];
    return [{ kind: "full" }];
  }
  if (REFERENCE_TABLES.has(table)) return [{ kind: "reference" }];
  return [{ kind: "full" }];
}

export interface PublishMessage {
  url: string;
  body: Scope;
  delay: number;
  deduplicationId: string;
  flowControl: { key: string; parallelism: number };
  retries: number;
  failureCallback: string;
  label: string;
}

/**
 * QStash rejects deduplication ids containing ':' (and the scope labels use it), so ids are
 * joined with '-' and any stray colon is replaced.
 */
export function deduplicationId(...parts: Array<string | number>): string {
  return parts.map(String).join("-").replace(/:/g, "-");
}

export function buildMessage(scope: Scope, baseUrl: string, nowMs: number): PublishMessage {
  const bucket = Math.floor(nowMs / (DEBOUNCE_SECONDS * 1000));
  return {
    url: `${baseUrl}/api/catalog/rebuild`,
    body: scope,
    delay: DEBOUNCE_SECONDS,
    deduplicationId: deduplicationId(scopeLabel(scope), bucket),
    flowControl: { key: "catalog-rebuild", parallelism: 1 },
    retries: REBUILD_RETRIES,
    failureCallback: `${baseUrl}/api/catalog/rebuild-failed`,
    label: "catalog",
  };
}

export interface EventDeps {
  store: CatalogStore;
  publish: (message: PublishMessage) => Promise<{ messageId: string } | null>;
  baseUrl: string;
  now?: () => number;
}

export type EventOutcome =
  | { status: "muted"; scopeKey: string }
  | { status: "deduped"; scopeKey: string }
  | { status: "collapsed"; scopeKey: "full"; messageId: string | null }
  | { status: "published"; scopeKey: string; messageId: string | null };

export async function processScope(scope: Scope, deps: EventDeps): Promise<EventOutcome> {
  const now = deps.now ?? Date.now;
  const key = scopeLabel(scope);
  const { store } = deps;

  if (await store.exists(KEYS.muted)) {
    // Rows that change while muted would otherwise wait for the nightly job. Schedule exactly one
    // full rebuild for when the mute ends; the debounce key makes later muted events no-ops.
    if (await store.setIfAbsent(KEYS.trailing, MUTE_SECONDS)) {
      const bucket = Math.floor(now() / (MUTE_SECONDS * 1000));
      await deps.publish({
        ...buildMessage({ kind: "full" }, deps.baseUrl, now()),
        delay: MUTE_SECONDS,
        deduplicationId: deduplicationId("full", "trailing", bucket),
      });
    }
    return { status: "muted", scopeKey: key };
  }
  if (!(await store.setIfAbsent(KEYS.pending(key), DEBOUNCE_SECONDS))) return { status: "deduped", scopeKey: key };

  const publishedThisWindow = await store.incrWithTtl(KEYS.published, BURST_WINDOW_SECONDS);
  if (publishedThisWindow > BURST_THRESHOLD && scope.kind !== "full") {
    await store.setIfAbsent(KEYS.muted, MUTE_SECONDS);
    const minuteBucket = Math.floor(now() / 60_000);
    const message = { ...buildMessage({ kind: "full" }, deps.baseUrl, now()), deduplicationId: deduplicationId("full", minuteBucket) };
    const result = await deps.publish(message);
    return { status: "collapsed", scopeKey: "full", messageId: result?.messageId ?? null };
  }

  const result = await deps.publish(buildMessage(scope, deps.baseUrl, now()));
  return { status: "published", scopeKey: key, messageId: result?.messageId ?? null };
}

export async function processEvent(payload: EventPayload, deps: EventDeps): Promise<EventOutcome[]> {
  const outcomes: EventOutcome[] = [];
  for (const scope of deriveScopes(payload)) outcomes.push(await processScope(scope, deps));
  return outcomes;
}
