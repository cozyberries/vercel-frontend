import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  Serwist,
  NetworkFirst,
  StaleWhileRevalidate,
  CacheFirst,
  ExpirationPlugin,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;
// Injected at build time by DefinePlugin — unique per Vercel deployment (or Next.js buildId locally).
// Versioning cache names causes old buckets to be abandoned on SW activation; entries expire naturally.
declare const __BUILD_ID__: string;
const v = __BUILD_ID__;

// Only cache successful same-origin responses
const cacheablePlugin = {
  cacheWillUpdate: async ({ response }: { response: Response }) =>
    response.status === 200 ? response : null,
};

// Accept opaque (cross-origin, status 0) and normal 200 responses — needed for cross-origin images
const opaqueOrOkPlugin = {
  cacheWillUpdate: async ({ response }: { response: Response }) =>
    response.status === 0 || response.status === 200 ? response : null,
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  // navigationPreload MUST be false — enabling it alongside NetworkFirst for navigate
  // requests causes a double-fetch race condition that crashes the service worker.
  navigationPreload: false,
  runtimeCaching: [
    // ── Page navigations ──────────────────────────────────────────────────────
    // NetworkFirst: always try the network first; fall back to cache on failure.
    // 10 s timeout prevents a slow server from showing the offline page too early.
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: `pages-cache-${v}`,
        networkTimeoutSeconds: 10,
        plugins: [
          cacheablePlugin,
          new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 24 * 60 * 60 }),
        ],
      }),
    },

    // ── Reference data APIs ───────────────────────────────────────────────────
    // StaleWhileRevalidate: serve cached immediately, refresh in the background.
    // These rarely change (categories, ages, sizes, genders) so stale is fine.
    {
      matcher: ({ url }) =>
        [
          "/api/categories",
          "/api/ages/options",
          "/api/sizes/options",
          "/api/genders/options",
          "/api/categories/options",
        ].some((p) => url.pathname.startsWith(p)),
      handler: new StaleWhileRevalidate({
        cacheName: `api-reference-cache-${v}`,
        plugins: [
          cacheablePlugin,
          new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 3600 }),
        ],
      }),
    },

    // ── Product listings ──────────────────────────────────────────────────────
    // NetworkFirst: prices and stock are mutable — always prefer fresh data.
    // 6 s timeout (raised from 3 s) to survive slow mobile connections.
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/products"),
      handler: new NetworkFirst({
        cacheName: `api-products-cache-${v}`,
        networkTimeoutSeconds: 6,
        plugins: [
          cacheablePlugin,
          new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 }),
        ],
      }),
    },

    // ── Next.js static chunks ─────────────────────────────────────────────────
    // CacheFirst: filenames are hash-busted by Next.js — truly immutable.
    // Defined before defaultCache so our rule wins if there's any overlap.
    {
      matcher: ({ url }) => url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: `next-static-${v}`,
        plugins: [
          cacheablePlugin,
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 365 * 24 * 60 * 60,
          }),
        ],
      }),
    },

    // ── Next.js image optimisation ────────────────────────────────────────────
    // This route was the direct cause of the production crash:
    //   "TypeError: c.handle is not a function" — the string "StaleWhileRevalidate"
    //   was passed as a handler; the SW tried to call .handle() on it and threw.
    // Fix: pass a real strategy instance. opaqueOrOkPlugin handles cross-origin imgs.
    {
      matcher: ({ url }) => url.pathname.startsWith("/_next/image"),
      handler: new StaleWhileRevalidate({
        cacheName: `next-image-${v}`,
        plugins: [
          opaqueOrOkPlugin,
          new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 3600 }),
        ],
      }),
    },

    // defaultCache covers everything else (fonts, etc.).
    // Our explicit rules above take priority because they are defined first.
    ...defaultCache,
  ],

  // Offline fallback — /offline must be in __SW_MANIFEST (precached).
  // Guaranteed via additionalPrecacheEntries in next.config.mjs.
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

// On activation, delete any cache buckets from previous deployments that share our
// known prefixes but carry a different build ID suffix.
const MANAGED_PREFIXES = [
  "pages-cache-",
  "api-reference-cache-",
  "api-products-cache-",
  "next-static-",
  "next-image-",
];

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (key) =>
              MANAGED_PREFIXES.some((p) => key.startsWith(p)) &&
              !key.endsWith(`-${v}`)
          )
          .map((key) => caches.delete(key))
      )
    )
  );
});
