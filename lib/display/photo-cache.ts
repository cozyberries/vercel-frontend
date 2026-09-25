import type { DisplaySlide } from "./slides";

/** Cache Storage bucket owned by /display. Not in the service worker's MANAGED_PREFIXES, so deploys keep it. */
export const DISPLAY_PHOTO_CACHE = "display-photos";
/** Cached photos older than this are re-downloaded when the network allows. */
export const PHOTO_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CACHED_AT_HEADER = "x-display-cached-at";

export type PhotoSource = Pick<DisplaySlide, "photoUrl" | "fallbackUrl">;

export interface PhotoCacheDeps {
  caches: CacheStorage | undefined;
  fetch: typeof fetch;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  now: () => number;
}

export interface PhotoCache {
  /** Make every slide's photo playable offline and evict the rest. Calls onReady as each photo becomes playable. */
  sync(slides: readonly PhotoSource[], onReady?: (photoUrl: string) => void): Promise<void>;
  /** Object URL for a playable photo, or null (offline and never cached). */
  photoFor(photoUrl: string): string | null;
}

type PhotoStore = Pick<Cache, "match" | "put" | "delete" | "keys">;

/** Used when the Cache API is missing or refuses to open: photos then live in memory only. */
const NO_STORE: PhotoStore = {
  match: async () => undefined,
  put: async () => {},
  delete: async () => false,
  keys: async () => [],
};

/**
 * Page-side photo store for the stall display. Kept out of the service worker on purpose: a CacheFirst
 * rule on `*_detail.webp` would also pin product-detail images for every customer.
 */
export function createPhotoCache(overrides: Partial<PhotoCacheDeps> = {}): PhotoCache {
  const deps: PhotoCacheDeps = {
    caches: "caches" in overrides ? overrides.caches : globalThis.caches,
    fetch: overrides.fetch ?? ((input, init) => globalThis.fetch(input, init)),
    createObjectURL: overrides.createObjectURL ?? ((blob) => URL.createObjectURL(blob)),
    revokeObjectURL: overrides.revokeObjectURL ?? ((url) => URL.revokeObjectURL(url)),
    now: overrides.now ?? Date.now,
  };
  const objectUrls = new Map<string, string>();

  async function openStore(): Promise<PhotoStore> {
    try {
      return deps.caches ? await deps.caches.open(DISPLAY_PHOTO_CACHE) : NO_STORE;
    } catch {
      return NO_STORE;
    }
  }

  /** WebP variant first, then the original; a Set skips the second fetch when both are the same URL. */
  async function download(src: PhotoSource): Promise<Response | null> {
    for (const url of new Set([src.photoUrl, src.fallbackUrl])) {
      try {
        const res = await deps.fetch(url, { mode: "cors" });
        if (!res.ok) continue;
        const blob = await res.blob();
        return new Response(blob, {
          headers: {
            "content-type": res.headers.get("content-type") ?? blob.type,
            [CACHED_AT_HEADER]: String(deps.now()),
          },
        });
      } catch {
        // Offline or blocked: try the next source.
      }
    }
    return null;
  }

  function isStale(res: Response): boolean {
    const cachedAt = Number(res.headers.get(CACHED_AT_HEADER));
    return !Number.isFinite(cachedAt) || deps.now() - cachedAt > PHOTO_MAX_AGE_MS;
  }

  function setObjectUrl(photoUrl: string, blob: Blob): void {
    const old = objectUrls.get(photoUrl);
    if (old) deps.revokeObjectURL(old);
    objectUrls.set(photoUrl, deps.createObjectURL(blob));
  }

  return {
    async sync(slides, onReady) {
      const store = await openStore();
      const wanted = new Set(slides.map((s) => s.photoUrl));

      for (const request of await store.keys()) {
        if (!wanted.has(request.url)) await store.delete(request);
      }
      for (const [photoUrl, objectUrl] of objectUrls) {
        if (wanted.has(photoUrl)) continue;
        deps.revokeObjectURL(objectUrl);
        objectUrls.delete(photoUrl);
      }

      for (const src of slides) {
        const cached = await store.match(src.photoUrl);
        if (cached && !isStale(cached)) {
          if (!objectUrls.has(src.photoUrl)) setObjectUrl(src.photoUrl, await cached.blob());
          onReady?.(src.photoUrl);
          continue;
        }
        const fresh = await download(src);
        if (fresh) {
          await store.put(src.photoUrl, fresh.clone());
          setObjectUrl(src.photoUrl, await fresh.blob());
          onReady?.(src.photoUrl);
        } else if (cached) {
          // The refresh failed (offline): keep playing the older copy.
          if (!objectUrls.has(src.photoUrl)) setObjectUrl(src.photoUrl, await cached.blob());
          onReady?.(src.photoUrl);
        }
      }
    },
    photoFor(photoUrl) {
      return objectUrls.get(photoUrl) ?? null;
    },
  };
}
