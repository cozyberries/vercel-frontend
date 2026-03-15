# Product Page ISR & Component Split Design

**Date:** 2026-03-15
**Status:** Approved
**Topic:** Speed up product detail page load times

---

## Context

The product detail page (`app/products/[id]/page.jsx`) is marked `"use client"`, which forces fully client-side rendering. Every visit triggers a waterfall:

1. Browser receives empty HTML shell
2. Downloads + parses JS bundle
3. React hydrates
4. `useProductById()` fires API request
5. `/api/products/[id]` checks Redis → Supabase
6. Data returns → page finally renders

Users see nothing until step 6. With 48 products that rarely change (days/weeks), this entire waterfall is avoidable. The existing Redis/React Query caching only helps repeat visits — it cannot fix the initial empty HTML problem.

---

## Design

### Core Fix: ISR + generateStaticParams

Convert the page to a Server Component with `generateStaticParams`. All 48 product pages are pre-built at deploy time and served as static HTML from the CDN. First load becomes instant.

```
revalidate = 86400   ← regenerate stale pages after 24h automatically
generateStaticParams ← pre-builds all 48 slugs at deploy time
```

### Architecture

```
app/products/[id]/page.tsx (Server Component — replaces page.jsx "use client")
  └── generateStaticParams()        ← fetches all 48 slugs from Supabase
  └── export const revalidate = 86400
  └── getProductBySlug(slug)        ← direct Supabase call (no HTTP round-trip)
  └── notFound() if product missing
  └── renders:
        ├── <ProductStaticInfo product={product} />  ← RSC, zero JS
        │     • product name, category badge
        │     • hero image (first image, static <Image> — LCP target)
        │     • description, features list, care instructions
        │
        └── <ProductInteractions product={product} initialSize={...} />  ← "use client"
              • full image gallery (thumbnails, zoom, swipe carousel)
              • size/color selector + dynamic price display
              • add to cart, buy now, wishlist buttons
              • quantity selector, share button
              • related products section
```

### New Server-Only Data Module

```
lib/services/products-server.ts   ← new, "server-only" import guard
  ├── getAllProductSlugs()         ← used by generateStaticParams
  │     Simple SELECT slug FROM products (no joins, fast)
  │
  └── getProductBySlug(slug)      ← used by page
        Reuses same Supabase JOIN query from /api/products/[id]/route.ts
        (product_images, product_features, product_variants in one query)
```

The existing `/api/products/[id]` API route is **unchanged** — still serves client-side fallback and retains its Redis caching layer.

### Component Refactor

The existing `components/product-details.tsx` (996 lines) is split:

| New file | Type | Contents |
|---|---|---|
| `components/product-static-info.tsx` | RSC | Name, category, hero image, description, features, care instructions |
| `components/product-interactions.tsx` | Client | Gallery, size/color selector, price, cart/wishlist CTAs, related products |

`components/product-details.tsx` can be removed once both new components are in place.

### Loading State

```
app/products/[id]/loading.tsx   ← replaces <div>Loading...</div> Suspense fallback
  └── Skeleton layout (Tailwind animate-pulse):
        • Left: grey image block (matches aspect ratio)
        • Right: skeleton lines for name, price, size buttons, CTA
        • No layout shift on load
```

---

## Files Modified / Created

| File | Action |
|---|---|
| `app/products/[id]/page.tsx` | New (replaces `page.jsx`) — RSC with generateStaticParams |
| `app/products/[id]/loading.tsx` | New — skeleton loading state |
| `lib/services/products-server.ts` | New — server-only Supabase fetch functions |
| `components/product-static-info.tsx` | New — RSC static section |
| `components/product-interactions.tsx` | New — client interactive section |
| `app/products/[id]/page.jsx` | Deleted ✓ |
| `components/product-details.tsx` | Deleted ✓ |

---

## What Is NOT Changed

- `/api/products/[id]` route — unchanged, Redis caching layer stays
- `hooks/useApiQueries.ts` — unchanged, still used for client-side fallback
- `lib/services/api.ts` — unchanged
- Cart, wishlist, rating contexts — unchanged

---

## Verification

1. `npm run build` — confirm generateStaticParams pre-builds 48 routes (output shows `○ /products/[id]` entries)
2. `npm run start` — test a product page URL directly; should load with pre-rendered HTML (view source shows product content, not empty shell)
3. Browser DevTools → Network → disable cache, hard reload a product page; first response should already contain product HTML (not just `<div>Loading...</div>`)
4. Chrome Lighthouse on a product page — verify LCP < 2s
5. Test size selector updates price, add to cart, wishlist toggle — all interactive features still work
6. Test related products section still loads
7. Verify 24h revalidation: not directly testable but confirm `revalidate` constant is set
