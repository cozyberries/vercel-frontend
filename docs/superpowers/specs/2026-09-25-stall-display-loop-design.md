# Stall Display Loop — Design

Date: 2026-09-25
Branch: `feature/stall-display-loop` (new, per the new-branch-per-feature rule)
Repo: storefront (`vercel-frontend`) only. No database, admin or catalog-pipeline changes.

## Why

CozyBerries has a permanent offline stall (see `2026-09-25-stall-pickup-orders-design.md`).
The stall needs a screen that plays product photos in an endless loop, to catch the eye of
passers-by and let them buy on the spot. That spec lists "Kiosk / display mode on a stall
tablet" as a future piece; this is a first, display-only version of it.

## Requirements (agreed)

- An endless loop of product photos, played in a **browser on a tablet or TV** at the stall.
- Each slide shows the photo, the product **name, price, and a QR code** that opens the
  product on the site, so the customer can order for stall pickup.
- Only products whose **first photo shows a baby/model** are included. The judgement is made by
  AI (vision) on the **first image only**.
- The "shows a baby" result lives in a **tag file committed to the repo** (approach A). It is not
  stored in the database.
- Slide layout **B**: the photo framed on a blurred copy of itself, with a floating details card.
- **7 seconds** per slide.

Success means staff open one link, tap once, and the screen runs all day without anyone touching it,
survives Wi-Fi drops and deploys, and customers can scan a slide and buy.

## Out of scope

- Video export (MP4), sound, AI video generation (Veo).
- A database flag or an admin checkbox for tagging (approach B was rejected).
- Tagging images other than the first one per product.
- Interactive kiosk features: browsing, cart, or checkout on the display device.
- Analytics beyond the `utm_source=stall` tag on QR links.

## Current system (facts this design builds on)

- The live catalog has 48 products (44 in stock) and 296 images. Every first image is a
  **2000×2000 JPEG** (0.6–1.4 MB).
- A visual pass over all 48 first images found **28 with a baby** and **20 flat-lays on hangers**.
  This matches the 28 photoshoot products from `2026-04-06-model-photo-upload-design.md`, whose
  script made each model photo image #1. At 7 s a slide, one loop lasts about 3.3 minutes.
- All 28 have a pre-generated **`1_detail.webp`** (1000×1000) from
  `2026-04-11-image-format-variants-design.md`. Together they weigh **4.7 MB**, against about
  30 MB of originals. `getVariantUrl(url, "detail", "webp")` in `lib/utils/image.ts` derives the URL.
- Supabase Storage answers public objects with `Access-Control-Allow-Origin: *` and
  `Cache-Control: public, max-age=3600`.
- `getSnapshot()` in `lib/catalog/cache.ts` returns `{ snapshot, source }` from Redis via the Next
  Data Cache, tagged `catalog`. `useCatalog(initialSnapshot)` in `hooks/useCatalog.ts` refreshes
  every 5 min and on reconnect, is persisted to localStorage, and never moves to an older snapshot.
- `ListCard.images[0]` is the first image in display order.
- Product cards price with `getMinPrice(product)` (`lib/utils.ts`) followed by `DiscountedPrice`,
  which calls `getDiscountedPrice(price)` in `lib/utils/discount.ts`. That applies the early-bird
  offer while it is enabled and not expired, and shows "Starts at" when `hasRange`.
- `components/ConditionalLayout.tsx` already renders `/login` and `/signup` without the header or
  bottom nav. `ImpersonationBanner`, `ScrollToTopButton` and `Toaster` render outside it.
- `app/sw.ts` (Serwist) caches page navigations NetworkFirst for **24 h** only, and `/api/catalog`
  stale-while-revalidate for 7 days. It has no rule for Supabase product photos. Old versioned
  caches are deleted on activation by `MANAGED_PREFIXES`.
- `components/pwa-update-handler.tsx` activates a waiting service worker and **reloads the page**
  once it takes control, i.e. after every deploy.
- The `qrcode` package (`^1.5.4`) is already a dependency.
- Product URLs are `/products/{slug}`.

## Design

### 1. The page and the slide

- **URL** `/display`. It is not linked from the navigation and not in the sitemap. It carries a
  `robots: { index: false }` metadata entry and is added to the `disallow` list in `app/robots.ts`.
- **Bare screen.** `/display` joins `/login` and `/signup` in the no-chrome branch of
  `ConditionalLayout`. The slide layer is `fixed inset-0` with a z-index above toasts, the
  impersonation banner and the scroll-to-top button, so nothing from the rest of the site shows.
- **Slide (layout B).**
  - A blurred, slightly darkened copy of the photo fills the whole viewport.
  - The square photo is framed with rounded corners and a soft shadow: on the left in landscape,
    at the top in portrait. Orientation is handled by a CSS `orientation` media query, so one page
    serves a TV or a tablet and follows a tablet as it rotates.
  - A cream card (`rgba(255,250,244,.92)`) holds the CozyBerries wordmark, the product name, the
    price, the QR code and the line "Scan to order · Pick up at the stall". In landscape the card
    sits right of the photo, full height. In portrait it is a strip below the photo.
- **Price.** Same rule as the `/products` card: `getMinPrice` then `getDiscountedPrice`. "Starts at"
  is shown when `hasRange`. When an offer is active the slide shows the struck-through MRP, the
  discounted price and the offer badge. The price is computed when each slide renders, so an offer
  expiring mid-day takes effect without a reload.
- **Motion.** 7 s per slide, a 1 s crossfade, and a slow zoom (scale 1.00 → 1.04) on the framed
  photo over each slide.
- **Order.** Shuffled at the start of every cycle. The first slide of a new cycle is never the
  last slide of the previous one.
- **Start.** The first run shows a "Tap to start" card. That tap requests fullscreen and a screen
  wake lock, since browsers allow both only after a user gesture. It also stores
  `display:started=1` in localStorage. Later taps toggle fullscreen.
- **QR.** Encodes `https://cozyberries.in/products/{slug}?utm_source=stall&utm_medium=display`,
  built from `NEXT_PUBLIC_SITE_URL` with that production URL as the fallback. It is generated in
  the browser with `qrcode` (SVG), so it works offline.

### 2. Data and tagging

- **Source.** `app/display/page.tsx` is a server component. It calls `getSnapshot()`, reads no
  `searchParams` and imports nothing from `next/headers`, so it stays static and is revalidated
  through the `catalog` tag. It passes the snapshot to `DisplayClient`, which calls
  `useCatalog(snapshot)`. Nothing new reads Redis or Supabase.
- **Tag file** `lib/display/model-photos.json`:
  ```json
  { "checkedAt": "2026-09-25", "withBaby": ["…28 slugs"], "withoutBaby": ["…20 slugs"] }
  ```
  Both lists are kept, so "checked, no baby" can be told apart from "never checked".
- **Selection** `lib/display/slides.ts` exports
  `selectSlides(snapshot: Snapshot, tags: ModelPhotoTags): DisplaySlide[]`. It keeps products
  where `in_stock` is true, the slug is in `withBaby`, and `images[0]` exists, preserving snapshot
  order. Each product maps to:
  ```ts
  interface DisplaySlide {
    slug: string;
    name: string;
    minPrice: number;      // from getMinPrice
    hasRange: boolean;     // from getMinPrice
    photoUrl: string;      // getVariantUrl(images[0], "detail", "webp")
    fallbackUrl: string;   // images[0]
    productUrl: string;    // /products/{slug}?utm_source=stall&utm_medium=display, absolute
  }
  ```
  `untaggedSlugs(snapshot, tags): string[]` in the same module returns the slugs in neither list.
- **Shuffle** `lib/display/shuffle.ts` exports `nextCycle(slides, previousLast, random = Math.random)`,
  a Fisher–Yates shuffle that rotates the order if it would start with `previousLast`.
- **New products** are hidden until tagged. `npm run display:untagged` (`scripts/display-untagged.mjs`)
  fetches `${CATALOG_BASE_URL ?? "https://cozyberries.in"}/api/catalog`, prints the untagged
  slugs with their first-image URLs, and exits 1 if any are found. Staff then ask Claude to look at
  those images and update the JSON, and the change ships with the next deploy.
- **Stock.** A sold-out product drops out on the next catalog refresh, within about 5 min. A
  restocked product comes back the same way.
- **Nothing to show.** When `selectSlides` returns `[]`, the screen shows a branded card with a
  "Scan to shop" QR code for the homepage, still with `utm_source=stall`.

### 3. Offline and all-day reliability

- **Photo cache** `lib/display/photo-cache.ts`, a page-side module using the Cache API, not a
  service-worker rule:
  - `syncPhotos(slides)` opens the `display-photos` cache and fetches any missing `photoUrl`
    (`mode: "cors"`). If that fails, it tries `fallbackUrl`, and stores whichever succeeds under
    the slide's slug. It deletes entries whose slug is no longer in `slides`.
  - `photoFor(slug)` returns an object URL for the cached blob, created once per slug and reused
    across cycles, or `null` if nothing is cached. Evicted slugs have their object URL revoked.
  - It runs on mount and again whenever `useCatalog` delivers a new snapshot.
  - Keeping this in the page, rather than adding a service-worker rule, leaves every other page's
    image caching unchanged. A `CacheFirst` rule on `*_detail.webp` would also pin the product
    detail pages' images for customers.
  - `display-photos` is not in the SW's `MANAGED_PREFIXES`, so a deploy never wipes it.
- **Page offline.** A new `app/sw.ts` rule, placed before the generic navigation rule, matches
  navigations to `/display` with NetworkFirst (10 s timeout) into `display-page-${v}`, with a
  30-day expiry. The matcher is exported from a small module (`lib/pwa/matchers.ts`) so it can be
  unit-tested. The cached HTML already contains the snapshot, so it can play with no network at all.
- **Missing photo.** If `photoFor` returns `null` (offline, never cached), that slide is skipped
  for the current cycle. If every slide is missing, the empty-state card shows.
- **Screen stays on.** `navigator.wakeLock.request("screen")` runs on start and again on every
  `visibilitychange` to visible. It is skipped silently where unsupported. The setup notes tell
  staff to set the device's screen timeout to "never" as a backstop.
- **Deploys.** `PwaUpdateHandler` reloads the page after each deploy. When `display:started=1`
  is set, the loop resumes playing immediately without the "Tap to start" card, and fullscreen is
  re-requested on the next tap.
- **Own installable app.** `public/display.webmanifest` sets `name: "CozyBerries Display"`,
  `start_url: "/display"`, `scope: "/display"`, `display: "fullscreen"`,
  `orientation: "any"`, and reuses the existing icons. `/display` sets `metadata.manifest` to it.
  Installed via "Add to Home screen", the loop opens with no browser chrome, even after a reload.
- **Nightly refresh.** `lib/display/schedule.ts` exports `msUntilNextReload(now: Date, hour = 4)`.
  The client sets a timer for it, and when the timer fires it reloads only if `navigator.onLine`.
  Otherwise it schedules the next day.
- **Memory.** At most two slides (current and next) are mounted. Photos are object URLs created
  once per slug. The slide timer is a single `setTimeout` chain, cleared on unmount.

### 4. Testing

All automated, vitest only. There are no Playwright specs, per the standing preference, and no
manual verification.

| Test file | Covers |
|---|---|
| `lib/display/slides.test.ts` | Only in-stock and `withBaby` products pass. Products without images are dropped. `photoUrl` is the `_detail.webp` variant and `fallbackUrl` the original. `productUrl` carries both UTM params. `minPrice` and `hasRange` match `getMinPrice`. An empty snapshot gives `[]`. `untaggedSlugs` returns only slugs in neither list. |
| `lib/display/shuffle.test.ts` | With a seeded `random`, each slide appears exactly once per cycle, a cycle never starts with `previousLast`, and one- and zero-slide inputs work. |
| `lib/display/model-photos.test.ts` | No duplicates, no slug in both lists, and `checkedAt` is an ISO date. |
| `lib/display/photo-cache.test.ts` | With a fake `caches` and `fetch`: missing photos are fetched and stored, a WebP failure falls back to the JPG, removed slugs are evicted and their object URLs revoked, one object URL per slug is reused, and an offline miss returns `null`. |
| `lib/display/schedule.test.ts` | `msUntilNextReload` before 4 am, after 4 am and exactly at 4 am. |
| `app/display/DisplayClient.test.tsx` (jsdom, fake timers) | The first run shows "Tap to start", and `display:started=1` auto-resumes. Slides advance every 7 s, at most 2 are mounted, a slide with no cached photo is skipped, `[]` shows the empty-state card, the price shows "Starts at" and the offer badge when applicable, the wake lock is re-requested on `visibilitychange`, and the nightly reload fires only when online. |
| `components/ConditionalLayout.test.tsx` | `/display` renders without `Header`, and `/products` still renders it. |
| `app/robots.test.ts` | `/display` is disallowed. |
| `lib/pwa/matchers.test.ts` | The display navigation matcher accepts `/display` navigations and rejects other paths and non-navigation requests. |

Done means `npm run lint`, `npm run test:unit` and `npm run build` all pass.

## Files

New:
- `app/display/page.tsx`: server component, metadata (`noindex`, manifest, title "CozyBerries Display").
- `app/display/DisplayClient.tsx`: player (start card, timer, crossfade, wake lock, nightly reload).
- `components/display/Slide.tsx`: layout B, one slide.
- `components/display/EmptySlide.tsx`: "Scan to shop" card.
- `lib/display/slides.ts`, `shuffle.ts`, `photo-cache.ts`, `schedule.ts`, `model-photos.json`, plus tests.
- `lib/pwa/matchers.ts`, plus a test.
- `public/display.webmanifest`.
- `scripts/display-untagged.mjs`.

Edited:
- `components/ConditionalLayout.tsx`: add `/display` to the bare branch.
- `app/robots.ts`: disallow `/display`.
- `app/sw.ts`: add the `/display` navigation rule.
- `package.json`: the `display:untagged` script.
- `CLAUDE.md`: a short "Stall display" section covering the tag file, `display:untagged`, and the
  staff setup steps below.

## Staff setup (goes into CLAUDE.md)

1. On the stall tablet or TV browser, open `https://cozyberries.in/display` while on Wi-Fi.
2. Use "Add to Home screen" / "Install app" and open **CozyBerries Display** from the home screen.
3. Tap "Tap to start" once.
4. In the device settings, set the screen timeout to "never" and turn off battery saver for the
   browser.
5. Leave it on Wi-Fi for the first minute so all photos download (about 5 MB). After that it keeps
   playing offline.

## Initial tag lists

`withBaby` (28):
coords-set-chinese-collar-soft-pear, coords-set-half-sleeve-petal-pops,
coords-set-layered-mushie-mini, coords-set-layered-pine-cone, coords-set-lilac-blossom,
coords-set-rocket-rangers, coords-set-ruffle-lilac-blossom, coords-set-ruffle-soft-pear,
frock-butterfly-sleeve-mushie-mini, frock-butterfly-sleeve-pine-cone,
frock-butterfly-sleeve-popsicles, frock-japanese-lilac-blossom, frock-japanese-petal-pops,
frock-japanese-soft-pear, frock-sleeveless-joyful-orbs, frock-sleeveless-moons-and-stars,
jhabla-shorts-half-sleeve-joyful-orbs, jhabla-shorts-half-sleeve-moons-and-stars,
jhabla-shorts-half-sleeve-mushie-mini, jhabla-shorts-half-sleeve-popsicles,
jhabla-shorts-half-sleeve-soft-pear, jhabla-shorts-sleeveless-moons-and-stars,
jhabla-shorts-sleeveless-naugthy-nuts, jhabla-sleeveless-joyful-orbs,
jhabla-sleeveless-moons-and-stars, jhabla-sleeveless-mushie-mini,
pyjamas-ribbed-moons-and-stars, pyjamas-ribbed-popsicles

`withoutBaby` (20):
frock-modern-aloe-green, frock-modern-peach, jhabla-sleeveless-popsicles,
new-born-essential-kits-joyful-orbs, new-born-essential-kits-moons-and-stars,
new-born-essential-kits-mushie-mini, new-born-essential-kits-popsicles,
pyjamas-classic-joyful-orbs, pyjamas-classic-moons-and-stars, pyjamas-classic-pine-cone,
pyjamas-classic-popsicles, pyjamas-ribbed-joyful-orbs, pyjamas-ribbed-mushie-mini,
pyjamas-ribbed-pine-cone, rompers-girls-only-loose-fit-aloe-green,
rompers-girls-only-loose-fit-lilac-blossom, rompers-girls-only-loose-fit-pastel-pink,
rompers-girls-only-loose-fit-petal-pops, rompers-unisex-half-sleeve-aloe-green,
rompers-unisex-half-sleeve-peach

On 2026-09-25 these lists cover every live product, and all 28 `withBaby` products are in stock.
Before shipping, `npm run display:untagged` must print nothing, and `model-photos.test.ts` must
pass (no duplicates, no overlap).

## Known limits

- Tags are keyed by slug. If a product's first photo is later replaced by a flat-lay, the tag is
  stale until someone re-tags it.
- Wake Lock and the Fullscreen API vary on smart-TV browsers. The installed-app manifest and the
  device's own screen timeout are the fallback.
- New products need a tag-file edit and a deploy before they appear.
