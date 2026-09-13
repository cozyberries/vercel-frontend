// Used only when Redis has no data or is unreachable. Builds the same shapes straight
// from Supabase (cookie-free) so pages still render, and alerts at most hourly.
import { unstable_cache } from "next/cache";
import { notifyCatalogAlert } from "@/lib/services/telegram";
import { buildProductDoc, buildReference, buildSnapshot, computeRatingSummaries, toListCard } from "./build";
import { KEYS, catalogStore } from "./store";
import { catalogDb } from "./supabase";
import type { ProductDoc, Snapshot } from "./types";

const ALERT_INTERVAL_MS = 60 * 60 * 1000;
let lastLocalAlertAt = 0;

const cachedFallbackSnapshot = unstable_cache(
  async (): Promise<Snapshot> => {
    const [referenceRows, rows, ratingRows] = await Promise.all([
      catalogDb.fetchReferenceRows(),
      catalogDb.fetchProductRows(),
      catalogDb.fetchRatingRows(),
    ]);
    const reference = buildReference(referenceRows);
    const ratings = computeRatingSummaries(ratingRows);
    const cards = rows.map((row) => toListCard(buildProductDoc(row, { reference, ratings })));
    return buildSnapshot(cards, reference, null, new Date()).snapshot;
  },
  ["cat:fallback-snapshot"],
  { revalidate: 60 },
);

/** Supabase-built snapshot, refreshed at most once a minute so an outage costs Supabase once per minute, not once per view. */
export async function fallbackSnapshot(): Promise<Snapshot> {
  return cachedFallbackSnapshot();
}

export async function fallbackProduct(slug: string): Promise<ProductDoc | null> {
  const [referenceRows, rows, ratingRows] = await Promise.all([
    catalogDb.fetchReferenceRows(),
    catalogDb.fetchProductRows([slug]),
    catalogDb.fetchRatingRows([slug]),
  ]);
  const row = rows[0];
  if (!row) return null;
  const doc = buildProductDoc(row, { reference: buildReference(referenceRows), ratings: computeRatingSummaries(ratingRows) });
  try {
    await catalogStore().writeProduct(doc);
  } catch {
    // Redis unavailable: serving from Supabase is enough.
  }
  return doc;
}

/** Log every fallback; alert Telegram at most once per hour (Redis throttle, then local throttle). */
export async function noteFallback(what: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[catalog] fallback for ${what}: ${message}`);
  let shouldAlert: boolean;
  try {
    shouldAlert = await catalogStore().setIfAbsent(KEYS.alertFallback, ALERT_INTERVAL_MS / 1000);
  } catch {
    shouldAlert = Date.now() - lastLocalAlertAt > ALERT_INTERVAL_MS;
  }
  if (!shouldAlert) return;
  lastLocalAlertAt = Date.now();
  void notifyCatalogAlert({ title: "Redis fallback in use", details: `${what}: ${message}` });
}
