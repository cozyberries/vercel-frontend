import { describe, expect, it, vi } from "vitest";
import { DISPLAY_PHOTO_CACHE, PHOTO_MAX_AGE_MS, createPhotoCache } from "./photo-cache";

/** In-memory stand-in for CacheStorage with one cache. */
function fakeCaches() {
  const store = new Map<string, Response>();
  const cache = {
    match: async (key: string) => store.get(String(key))?.clone(),
    put: async (key: string, res: Response) => {
      store.set(String(key), res);
    },
    delete: async (key: string | { url: string }) => store.delete(typeof key === "string" ? key : key.url),
    keys: async () => [...store.keys()].map((url) => ({ url })),
  };
  const caches = { open: vi.fn(async () => cache) } as unknown as CacheStorage;
  return { store, caches };
}

/** fetch that serves `routes[url]` as the body, 404 for anything else. */
function fakeFetch(routes: Record<string, string>) {
  return vi.fn(async (url: string) =>
    url in routes
      ? new Response(new Blob([routes[url]]), { status: 200, headers: { "content-type": "image/webp" } })
      : new Response(null, { status: 404 }),
  );
}
const offlineFetch = () =>
  vi.fn(async () => {
    throw new TypeError("Failed to fetch");
  });

function build(opts: { caches?: CacheStorage; fetch: (url: string) => Promise<Response>; now?: () => number }) {
  let n = 0;
  const createObjectURL = vi.fn(() => `blob:${++n}`);
  const revokeObjectURL = vi.fn();
  const cache = createPhotoCache({
    caches: opts.caches,
    fetch: opts.fetch as unknown as typeof fetch,
    now: opts.now ?? (() => 0),
    createObjectURL,
    revokeObjectURL,
  });
  return { cache, createObjectURL, revokeObjectURL };
}

const bodyOf = async (res: Response | undefined) => (res ? await res.clone().text() : null);

const A = { photoUrl: "https://img/a_detail.webp", fallbackUrl: "https://img/a.jpg" };
const B = { photoUrl: "https://img/b_detail.webp", fallbackUrl: "https://img/b.jpg" };

describe("createPhotoCache", () => {
  it("downloads missing photos into the display-photos cache and serves object URLs", async () => {
    const fc = fakeCaches();
    const { cache } = build({ caches: fc.caches, fetch: fakeFetch({ [A.photoUrl]: "A-webp", [B.photoUrl]: "B-webp" }) });
    const ready: string[] = [];
    await cache.sync([A, B], (url) => ready.push(url));
    expect(fc.caches.open).toHaveBeenCalledWith(DISPLAY_PHOTO_CACHE);
    expect(await bodyOf(fc.store.get(A.photoUrl))).toBe("A-webp");
    expect(ready).toEqual([A.photoUrl, B.photoUrl]);
    expect(cache.photoFor(A.photoUrl)).toMatch(/^blob:/);
  });

  it("falls back to the original JPG when the WebP variant fails, stored under the photo URL", async () => {
    const fc = fakeCaches();
    const { cache } = build({ caches: fc.caches, fetch: fakeFetch({ [A.fallbackUrl]: "A-jpg" }) });
    await cache.sync([A]);
    expect(await bodyOf(fc.store.get(A.photoUrl))).toBe("A-jpg");
    expect(cache.photoFor(A.photoUrl)).not.toBeNull();
  });

  it("evicts photos whose slide is gone and revokes their object URLs", async () => {
    const fc = fakeCaches();
    const { cache, revokeObjectURL } = build({
      caches: fc.caches,
      fetch: fakeFetch({ [A.photoUrl]: "A", [B.photoUrl]: "B" }),
    });
    await cache.sync([A, B]);
    const bObjectUrl = cache.photoFor(B.photoUrl);
    await cache.sync([A]);
    expect([...fc.store.keys()]).toEqual([A.photoUrl]);
    expect(revokeObjectURL).toHaveBeenCalledWith(bObjectUrl);
    expect(cache.photoFor(B.photoUrl)).toBeNull();
  });

  it("reuses cached photos and their object URLs across syncs", async () => {
    const fetch = fakeFetch({ [A.photoUrl]: "A" });
    const { cache, createObjectURL } = build({ caches: fakeCaches().caches, fetch });
    await cache.sync([A]);
    await cache.sync([A]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("plays from the cache after a reload even when offline", async () => {
    const fc = fakeCaches();
    await build({ caches: fc.caches, fetch: fakeFetch({ [A.photoUrl]: "A" }) }).cache.sync([A]);
    const afterReload = build({ caches: fc.caches, fetch: offlineFetch() }).cache;
    await afterReload.sync([A]);
    expect(afterReload.photoFor(A.photoUrl)).not.toBeNull();
  });

  it("returns null for a photo that was never cached while offline", async () => {
    const { cache } = build({ caches: fakeCaches().caches, fetch: offlineFetch() });
    const onReady = vi.fn();
    await expect(cache.sync([A], onReady)).resolves.toBeUndefined();
    expect(cache.photoFor(A.photoUrl)).toBeNull();
    expect(onReady).not.toHaveBeenCalled();
  });

  it("drops the old entry when a product's first-image URL changes", async () => {
    const fc = fakeCaches();
    const A2 = { photoUrl: "https://img/a-new_detail.webp", fallbackUrl: "https://img/a-new.jpg" };
    const { cache } = build({ caches: fc.caches, fetch: fakeFetch({ [A.photoUrl]: "old", [A2.photoUrl]: "new" }) });
    await cache.sync([A]);
    await cache.sync([A2]);
    expect([...fc.store.keys()]).toEqual([A2.photoUrl]);
  });

  it("re-downloads a photo older than seven days, keeping the old copy if that fails", async () => {
    const fc = fakeCaches();
    let now = 0;
    await build({ caches: fc.caches, fetch: fakeFetch({ [A.photoUrl]: "v1" }), now: () => now }).cache.sync([A]);
    now = PHOTO_MAX_AGE_MS + 1;

    const offline = build({ caches: fc.caches, fetch: offlineFetch(), now: () => now }).cache;
    await offline.sync([A]);
    expect(offline.photoFor(A.photoUrl)).not.toBeNull();
    expect(await bodyOf(fc.store.get(A.photoUrl))).toBe("v1");

    await build({ caches: fc.caches, fetch: fakeFetch({ [A.photoUrl]: "v2" }), now: () => now }).cache.sync([A]);
    expect(await bodyOf(fc.store.get(A.photoUrl))).toBe("v2");
  });

  it("swaps the object URL when a stale photo is refreshed in the same session", async () => {
    let now = 0;
    let body = "v1";
    const fetch = vi.fn(async () => new Response(new Blob([body]), { status: 200, headers: { "content-type": "image/webp" } }));
    const { cache, revokeObjectURL } = build({ caches: fakeCaches().caches, fetch, now: () => now });
    await cache.sync([A]);
    const before = cache.photoFor(A.photoUrl);
    now = PHOTO_MAX_AGE_MS + 1;
    body = "v2";
    await cache.sync([A]);
    expect(revokeObjectURL).toHaveBeenCalledWith(before);
    expect(cache.photoFor(A.photoUrl)).not.toBe(before);
  });

  it("fetches once when the photo and its fallback are the same URL", async () => {
    const same = { photoUrl: "https://res.cloudinary.com/a.jpg", fallbackUrl: "https://res.cloudinary.com/a.jpg" };
    const fetch = fakeFetch({});
    await build({ caches: fakeCaches().caches, fetch }).cache.sync([same]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("still plays from memory when the Cache API is unavailable", async () => {
    const { cache } = build({ caches: undefined, fetch: fakeFetch({ [A.photoUrl]: "A" }) });
    await cache.sync([A]);
    expect(cache.photoFor(A.photoUrl)).not.toBeNull();
  });
});
