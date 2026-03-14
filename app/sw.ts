import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // All page navigations — NetworkFirst with offline fallback (timeout 10s so slow/server hiccups don’t show offline page)
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: "NetworkFirst",
      options: {
        cacheName: "pages-cache",
        networkTimeoutSeconds: 10,
        expiration: { maxEntries: 30, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
    // Reference data APIs — StaleWhileRevalidate (matches next.config.mjs 1h cache headers)
    {
      matcher: ({ url }) =>
        [
          "/api/categories",
          "/api/ages/options",
          "/api/sizes/options",
          "/api/genders/options",
          "/api/categories/options",
        ].some((p) => url.pathname.startsWith(p)),
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "api-reference-cache",
        expiration: { maxEntries: 20, maxAgeSeconds: 3600 },
      },
    },
    // Product listings — NetworkFirst (price/stock sensitive)
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/products"),
      handler: "NetworkFirst",
      options: {
        cacheName: "api-products-cache",
        networkTimeoutSeconds: 3,
        expiration: { maxEntries: 50, maxAgeSeconds: 60 },
      },
    },
    // Cloudinary images — CacheFirst (immutable CDN, q_auto/f_auto)
    {
      matcher: ({ url }) => url.hostname === "res.cloudinary.com",
      handler: "CacheFirst",
      options: {
        cacheName: "cloudinary-images",
        expiration: { maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
    // Next.js static chunks — CacheFirst (hash-busted filenames, truly immutable)
    {
      matcher: ({ url }) => url.pathname.startsWith("/_next/static/"),
      handler: "CacheFirst",
      options: {
        cacheName: "next-static",
        expiration: { maxEntries: 200, maxAgeSeconds: 365 * 24 * 60 * 60 },
      },
    },
    // Next.js image optimization
    {
      matcher: ({ url }) => url.pathname.startsWith("/_next/image"),
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "next-image",
        expiration: { maxEntries: 60, maxAgeSeconds: 3600 },
      },
    },
    ...defaultCache,
  ],
  // Offline fallback: failed navigations → /offline page (precached)
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
