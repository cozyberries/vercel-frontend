# Stall Display Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/display`, a full-screen page that plays the in-stock products whose first photo shows a baby in an endless, offline-safe loop on the stall's tablet or TV. Each slide shows the name, price and a QR code to buy.

**Architecture:** A static App Router page reads the existing catalog snapshot (`getSnapshot()`) and hands it to a client player. Pure modules under `lib/display/` choose the slides, from a committed tag file plus stock status, and shuffle each cycle. A page-side Cache API store (`display-photos`) keeps the 1000×1000 WebP photos offline. A service-worker rule keeps the page itself for 30 days. The player owns the timer, the crossfade, fullscreen and wake lock, auto-resume, and the nightly reload.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript (strict), Tailwind 3.4 (`landscape:`/`portrait:` variants), TanStack Query via `useCatalog`, Serwist service worker, `qrcode` 1.5, vitest 4 with Testing Library and jsdom.

**Spec:** `docs/superpowers/specs/2026-09-25-stall-display-loop-design.md`

## Global Constraints

- Work on branch `feature/stall-display-loop`, created from `origin/develop`. `develop` holds the checkout hotfix that `main` lacks.
- **Commits:** the user's standing rule is "do not commit unless explicitly asked". Each task ends with a commit step. Run it only if the user approved per-task commits at execution handoff; otherwise skip it and leave the changes in the working tree.
- Seconds per slide: `SLIDE_MS = 7000`. Crossfade: `FADE_MS = 1000`. Nightly reload hour: `4` (local time). Photo refresh age: 7 days. `/display` page cache: 30 days.
- Photo URL: `getVariantUrl(images[0], "detail", "webp")`. Fallback: the original first image.
- QR target: `https://cozyberries.in/products/{slug}?utm_source=stall&utm_medium=display`, with the origin taken from `NEXT_PUBLIC_SITE_URL` and `https://cozyberries.in` as the fallback. The empty-state QR uses the homepage with the same UTM tags.
- Copy, exact: `Tap to start`, `Scan to order`, `Pick up at the stall`, `Scan to shop`, `CozyBerries Display` (the app name).
- localStorage key: `display:started` (value `"1"`). Cache Storage name: `display-photos`. SW cache: `display-page-${v}`.
- Nothing under `lib/display/` imports `next/headers`, and `app/display/page.tsx` reads no `searchParams`. The page must stay static.
- Only products that are in stock, listed in `withBaby` in `lib/display/model-photos.json`, and have `images[0]` appear.
- Tests: vitest only (`npm run test:unit`). DOM tests start with the `// @vitest-environment jsdom` docblock. No Playwright, no manual verification.
- Free tiers only: no new services, no new runtime dependencies.
- Done means `npm run lint`, `npm run test:unit` and `npm run build` all pass, and `npm run display:untagged` prints that every product is tagged.

**Deliberate refinements of the spec** (the reviewer should accept these):
- `untaggedSlugs` becomes `untaggedProducts` in `scripts/lib/display-untagged.mjs`. The script is plain Node (`tsx` is not a direct dependency) and no app code needs it.
- The photo cache is keyed by `photoUrl`, not slug, so a changed first image evicts the old entry. Entries older than 7 days are re-downloaded when online.
- The slide timer is a single `setInterval`, cleared on unmount. That gives the same guarantee as the spec's single `setTimeout` chain.
- The price assertions ("Starts at", offer badge) live in `components/display/Slide.test.tsx`, where the price is rendered.
- Adds `app/display/page.test.ts` for the page metadata and the manifest.

## Review Focus

1. **A catalog refresh mid-cycle removes a product** (it sells out, or loses its tag): it must never be shown again, even though it is still queued in the current cycle, and the loop continues. Tested in Task 5.
2. **localStorage is blocked** (private mode, kiosk browsers): the start card still shows, a tap starts the loop, and nothing throws. Tested in Task 5.
3. **Fullscreen or Wake Lock is missing or rejects** (smart-TV browsers): a tap still starts the loop with no unhandled rejection. Tested in Task 5.
4. **A product's first photo changes**, either to a new URL or with new bytes at the same URL: the old entry is evicted, or refreshed after 7 days. A failed refresh keeps the old copy playing. Tested in Task 3.
5. **The first image is not on Supabase**, so `photoUrl === fallbackUrl`, **or only one slide qualifies**: one fetch, not two, and a one-slide loop keeps cycling. Tested in Tasks 1, 2, 3 and 5.

---

### Task 1: Tag file and slide selection

**Files:**
- Create: `lib/display/model-photos.json`
- Create: `lib/display/slides.ts`
- Create: `lib/display/__fixtures__/cards.ts`
- Test: `lib/display/slides.test.ts`, `lib/display/model-photos.test.ts`

**Interfaces:**
- Consumes: `Snapshot`, `ListCard` from `@/lib/catalog/types`; `getMinPrice` from `@/lib/utils`; `getVariantUrl`, `normalizeAbsoluteUrl` from `@/lib/utils/image`.
- Produces:
  - `interface ModelPhotoTags { checkedAt: string; withBaby: string[]; withoutBaby: string[] }`
  - `interface DisplaySlide { slug: string; name: string; minPrice: number; hasRange: boolean; photoUrl: string; fallbackUrl: string; productUrl: string }`
  - `selectSlides(snapshot: Snapshot, tags: ModelPhotoTags, origin?: string): DisplaySlide[]`
  - `displayUrl(path: string, origin?: string): string`, `siteOrigin(): string`, `DISPLAY_UTM`
  - Fixtures: `SUPABASE_PRODUCTS`, `displayCard(slug, overrides?)`, `displaySnapshot(products, version?)`

- [ ] **Step 1: Create the branch**

```bash
git fetch origin develop
git checkout -b feature/stall-display-loop origin/develop
```

Expected: `Switched to a new branch 'feature/stall-display-loop'`. The uncommitted `.gitignore` change and the git-ignored spec come along.

- [ ] **Step 2: Write the tag file**

Create `lib/display/model-photos.json`:

```json
{
  "checkedAt": "2026-09-25",
  "withBaby": [
    "coords-set-chinese-collar-soft-pear",
    "coords-set-half-sleeve-petal-pops",
    "coords-set-layered-mushie-mini",
    "coords-set-layered-pine-cone",
    "coords-set-lilac-blossom",
    "coords-set-rocket-rangers",
    "coords-set-ruffle-lilac-blossom",
    "coords-set-ruffle-soft-pear",
    "frock-butterfly-sleeve-mushie-mini",
    "frock-butterfly-sleeve-pine-cone",
    "frock-butterfly-sleeve-popsicles",
    "frock-japanese-lilac-blossom",
    "frock-japanese-petal-pops",
    "frock-japanese-soft-pear",
    "frock-sleeveless-joyful-orbs",
    "frock-sleeveless-moons-and-stars",
    "jhabla-shorts-half-sleeve-joyful-orbs",
    "jhabla-shorts-half-sleeve-moons-and-stars",
    "jhabla-shorts-half-sleeve-mushie-mini",
    "jhabla-shorts-half-sleeve-popsicles",
    "jhabla-shorts-half-sleeve-soft-pear",
    "jhabla-shorts-sleeveless-moons-and-stars",
    "jhabla-shorts-sleeveless-naugthy-nuts",
    "jhabla-sleeveless-joyful-orbs",
    "jhabla-sleeveless-moons-and-stars",
    "jhabla-sleeveless-mushie-mini",
    "pyjamas-ribbed-moons-and-stars",
    "pyjamas-ribbed-popsicles"
  ],
  "withoutBaby": [
    "frock-modern-aloe-green",
    "frock-modern-peach",
    "jhabla-sleeveless-popsicles",
    "new-born-essential-kits-joyful-orbs",
    "new-born-essential-kits-moons-and-stars",
    "new-born-essential-kits-mushie-mini",
    "new-born-essential-kits-popsicles",
    "pyjamas-classic-joyful-orbs",
    "pyjamas-classic-moons-and-stars",
    "pyjamas-classic-pine-cone",
    "pyjamas-classic-popsicles",
    "pyjamas-ribbed-joyful-orbs",
    "pyjamas-ribbed-mushie-mini",
    "pyjamas-ribbed-pine-cone",
    "rompers-girls-only-loose-fit-aloe-green",
    "rompers-girls-only-loose-fit-lilac-blossom",
    "rompers-girls-only-loose-fit-pastel-pink",
    "rompers-girls-only-loose-fit-petal-pops",
    "rompers-unisex-half-sleeve-aloe-green",
    "rompers-unisex-half-sleeve-peach"
  ]
}
```

(`naugthy` is the live slug's spelling. Do not "fix" it.)

- [ ] **Step 3: Write the fixtures**

Create `lib/display/__fixtures__/cards.ts`:

```ts
import type { ListCard, Snapshot } from "@/lib/catalog/types";

export const SUPABASE_PRODUCTS = "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/public/media/products";

/** A minimal in-stock ListCard whose first image is a Supabase product photo. */
export function displayCard(slug: string, overrides: Partial<ListCard> = {}): ListCard {
  return {
    id: slug,
    slug,
    name: `Name ${slug}`,
    description: "",
    price: 500,
    min_price: 500,
    stock_quantity: 5,
    in_stock: true,
    is_featured: false,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    category_slug: "frocks",
    gender_slug: "girl",
    size_slugs: [],
    color_slugs: [],
    base_colors: [],
    age_slugs: [],
    categories: null,
    genders: null,
    category: "frocks",
    images: [`${SUPABASE_PRODUCTS}/${slug}/1.jpg`, `${SUPABASE_PRODUCTS}/${slug}/2.jpg`],
    sizes: [],
    colors: [],
    ...overrides,
  };
}

export function displaySnapshot(products: ListCard[], version = "v1"): Snapshot {
  return {
    version,
    generatedAt: "2026-09-25T00:00:00.000Z",
    products,
    reference: { categories: [], genders: [], sizes: [], ages: [], colors: [] },
  };
}
```

- [ ] **Step 4: Write the failing tests**

Create `lib/display/slides.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { getMinPrice } from "@/lib/utils";
import { SUPABASE_PRODUCTS, displayCard, displaySnapshot } from "./__fixtures__/cards";
import { displayUrl, selectSlides, type ModelPhotoTags } from "./slides";

const ORIGIN = "https://cozyberries.in";
const tags: ModelPhotoTags = { checkedAt: "2026-09-25", withBaby: ["a", "b", "c", "d"], withoutBaby: ["flat"] };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("selectSlides", () => {
  it("keeps in-stock products tagged withBaby that have an image, in snapshot order", () => {
    const snapshot = displaySnapshot([
      displayCard("a"),
      displayCard("flat"),
      displayCard("b", { in_stock: false }),
      displayCard("c", { images: [] }),
      displayCard("untagged"),
      displayCard("d"),
    ]);
    expect(selectSlides(snapshot, tags, ORIGIN).map((s) => s.slug)).toEqual(["a", "d"]);
  });

  it("uses the first image's detail WebP, keeps the original as fallback, and tags the QR link", () => {
    const [slide] = selectSlides(displaySnapshot([displayCard("a")]), tags, ORIGIN);
    expect(slide).toEqual({
      slug: "a",
      name: "Name a",
      minPrice: 500,
      hasRange: false,
      photoUrl: `${SUPABASE_PRODUCTS}/a/1_detail.webp`,
      fallbackUrl: `${SUPABASE_PRODUCTS}/a/1.jpg`,
      productUrl: "https://cozyberries.in/products/a?utm_source=stall&utm_medium=display",
    });
  });

  it("prices exactly like the /products card (lowest in-stock size, range flag)", () => {
    const sizes = [
      { name: "0-3M", slug: "0-3m", price: 450, stock_quantity: 2, display_order: 1 },
      { name: "3-6M", slug: "3-6m", price: 400, stock_quantity: 0, display_order: 2 },
      { name: "6-12M", slug: "6-12m", price: 600, stock_quantity: 1, display_order: 3 },
    ];
    const [slide] = selectSlides(displaySnapshot([displayCard("a", { sizes })]), tags, ORIGIN);
    expect({ minPrice: slide.minPrice, hasRange: slide.hasRange }).toEqual({ minPrice: 450, hasRange: true });
    const card = getMinPrice({ price: 500, sizes, variants: [] });
    expect({ minPrice: card.min, hasRange: card.hasRange }).toEqual({ minPrice: slide.minPrice, hasRange: slide.hasRange });
  });

  it("returns [] for an empty catalog", () => {
    expect(selectSlides(displaySnapshot([]), tags, ORIGIN)).toEqual([]);
  });

  it("uses one URL for photo and fallback when the first image is not on Supabase", () => {
    const url = "https://res.cloudinary.com/cozy/image/upload/a.jpg";
    const [slide] = selectSlides(displaySnapshot([displayCard("a", { images: [url] })]), tags, ORIGIN);
    expect(slide.photoUrl).toBe(url);
    expect(slide.fallbackUrl).toBe(url);
  });

  it("builds absolute links from NEXT_PUBLIC_SITE_URL by default", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://preview.example.com/");
    const [slide] = selectSlides(displaySnapshot([displayCard("a")]), tags);
    expect(slide.productUrl).toBe("https://preview.example.com/products/a?utm_source=stall&utm_medium=display");
  });
});

describe("displayUrl", () => {
  it("appends the stall UTM tags to paths with and without a query", () => {
    expect(displayUrl("/", ORIGIN)).toBe("https://cozyberries.in/?utm_source=stall&utm_medium=display");
    expect(displayUrl("/products?view=grid", ORIGIN)).toBe(
      "https://cozyberries.in/products?view=grid&utm_source=stall&utm_medium=display",
    );
  });
});
```

Create `lib/display/model-photos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import tags from "./model-photos.json";

const all = [...tags.withBaby, ...tags.withoutBaby];

describe("model-photos.json", () => {
  it("has no duplicate slugs", () => {
    expect(new Set(all).size).toBe(all.length);
  });

  it("never lists a slug as both withBaby and withoutBaby", () => {
    const withBaby = new Set(tags.withBaby);
    expect(tags.withoutBaby.filter((slug) => withBaby.has(slug))).toEqual([]);
  });

  it("holds slug-shaped entries only", () => {
    for (const slug of all) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("records the tagging date as an ISO date", () => {
    expect(tags.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(tags.checkedAt))).toBe(false);
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run lib/display`
Expected: `slides.test.ts` FAILS with `Failed to resolve import "./slides"`. `model-photos.test.ts` PASSES, because it only checks the data file.

- [ ] **Step 6: Implement `lib/display/slides.ts`**

```ts
import type { ListCard, Snapshot } from "@/lib/catalog/types";
import { getMinPrice } from "@/lib/utils";
import { getVariantUrl, normalizeAbsoluteUrl } from "@/lib/utils/image";

/** Result of the one-off vision pass over each product's first photo (lib/display/model-photos.json). */
export interface ModelPhotoTags {
  checkedAt: string;
  withBaby: string[];
  withoutBaby: string[];
}

/** One slide of the stall display loop. */
export interface DisplaySlide {
  slug: string;
  name: string;
  minPrice: number;
  hasRange: boolean;
  /** 1000×1000 WebP variant of the first image. */
  photoUrl: string;
  /** The original first image, used when the variant cannot be fetched. */
  fallbackUrl: string;
  /** Absolute product link carrying the stall UTM tags; encoded in the slide's QR code. */
  productUrl: string;
}

export const DISPLAY_UTM = "utm_source=stall&utm_medium=display";

export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "") || "https://cozyberries.in";
}

/** Absolute site URL for `path` with the stall UTM tags appended. */
export function displayUrl(path: string, origin: string = siteOrigin()): string {
  return `${origin}${path}${path.includes("?") ? "&" : "?"}${DISPLAY_UTM}`;
}

function toSlide(card: ListCard, firstImage: string, origin: string): DisplaySlide {
  // ListCard.sizes carries the price/stock fields getMinPrice reads; listing cards have no variants.
  const { min, hasRange } = getMinPrice({ price: card.price, sizes: card.sizes, variants: [] });
  return {
    slug: card.slug,
    name: card.name,
    minPrice: min,
    hasRange,
    photoUrl: getVariantUrl(firstImage, "detail", "webp"),
    fallbackUrl: normalizeAbsoluteUrl(firstImage.trim()),
    productUrl: displayUrl(`/products/${card.slug}`, origin),
  };
}

/** In-stock products whose first photo is tagged withBaby, in snapshot order. */
export function selectSlides(snapshot: Snapshot, tags: ModelPhotoTags, origin: string = siteOrigin()): DisplaySlide[] {
  const withBaby = new Set(tags.withBaby);
  return snapshot.products.flatMap((card) => {
    const first = card.images[0];
    return card.in_stock && withBaby.has(card.slug) && first ? [toSlide(card, first, origin)] : [];
  });
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run lib/display`
Expected: PASS, 11 tests.

- [ ] **Step 8: Commit** (only with the user's approval; see Global Constraints)

```bash
git add lib/display/model-photos.json lib/display/slides.ts lib/display/__fixtures__/cards.ts lib/display/slides.test.ts lib/display/model-photos.test.ts
git commit -m "feat(display): tag file and slide selection for the stall loop"
```

---

### Task 2: Playback helpers (shuffle and timing)

**Files:**
- Create: `lib/display/shuffle.ts`, `lib/display/schedule.ts`
- Test: `lib/display/shuffle.test.ts`, `lib/display/schedule.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `nextCycle<T extends { slug: string }>(slides: readonly T[], previousLastSlug: string | null, random?: () => number): T[]`
  - `SLIDE_MS = 7000`, `FADE_MS = 1000`, `NIGHTLY_RELOAD_HOUR = 4`
  - `msUntilNextReload(now: Date, hour?: number): number`

- [ ] **Step 1: Write the failing tests**

Create `lib/display/shuffle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextCycle } from "./shuffle";

/** mulberry32: small deterministic PRNG so shuffles are reproducible. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const slides = ["a", "b", "c", "d"].map((slug) => ({ slug }));
const slugs = (list: { slug: string }[]) => list.map((s) => s.slug);

describe("nextCycle", () => {
  it("plays every slide exactly once per cycle", () => {
    for (let seed = 1; seed <= 50; seed++) {
      expect(slugs(nextCycle(slides, null, seeded(seed))).sort()).toEqual(["a", "b", "c", "d"]);
    }
  });

  it("never starts a cycle on the slide the previous cycle ended with", () => {
    for (let seed = 1; seed <= 200; seed++) {
      expect(nextCycle(slides, "c", seeded(seed))[0].slug).not.toBe("c");
    }
  });

  it("rotates by one when the shuffle would repeat the last slide", () => {
    // random() ≈ 1 makes Fisher–Yates swap every item with itself: order stays a, b, c, d.
    expect(slugs(nextCycle(slides, "a", () => 0.999))).toEqual(["b", "c", "d", "a"]);
  });

  it("handles one-slide and empty loops", () => {
    expect(slugs(nextCycle([{ slug: "a" }], "a"))).toEqual(["a"]);
    expect(nextCycle([], "a")).toEqual([]);
  });

  it("does not mutate its input", () => {
    const input = [...slides];
    nextCycle(input, null, seeded(7));
    expect(slugs(input)).toEqual(["a", "b", "c", "d"]);
  });
});
```

Create `lib/display/schedule.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FADE_MS, SLIDE_MS, msUntilNextReload } from "./schedule";

const HOUR = 60 * 60 * 1000;

describe("msUntilNextReload", () => {
  it("waits until 4 am today when it is earlier", () => {
    expect(msUntilNextReload(new Date(2026, 8, 25, 3, 0, 0))).toBe(HOUR);
  });

  it("treats exactly 4 am as tomorrow's reload", () => {
    expect(msUntilNextReload(new Date(2026, 8, 25, 4, 0, 0))).toBe(24 * HOUR);
  });

  it("rolls over to tomorrow in the evening", () => {
    expect(msUntilNextReload(new Date(2026, 8, 25, 22, 30, 0))).toBe(5.5 * HOUR);
  });

  it("rolls over month ends", () => {
    expect(msUntilNextReload(new Date(2026, 8, 30, 23, 0, 0))).toBe(5 * HOUR);
  });

  it("honours a custom hour", () => {
    expect(msUntilNextReload(new Date(2026, 8, 25, 1, 0, 0), 2)).toBe(HOUR);
  });
});

describe("timing constants", () => {
  it("shows each slide for 7 s with a 1 s crossfade", () => {
    expect(SLIDE_MS).toBe(7000);
    expect(FADE_MS).toBe(1000);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/display/shuffle.test.ts lib/display/schedule.test.ts`
Expected: FAIL with `Failed to resolve import "./shuffle"` and `Failed to resolve import "./schedule"`.

- [ ] **Step 3: Implement both modules**

Create `lib/display/shuffle.ts`:

```ts
/**
 * Fisher–Yates shuffle for one pass of the stall loop. If the shuffle would open on the slide the
 * previous pass ended with, the order is rotated by one so the same product never shows twice in a row.
 */
export function nextCycle<T extends { slug: string }>(
  slides: readonly T[],
  previousLastSlug: string | null,
  random: () => number = Math.random,
): T[] {
  const order = [...slides];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (order.length > 1 && order[0].slug === previousLastSlug) order.push(order.shift()!);
  return order;
}
```

Create `lib/display/schedule.ts`:

```ts
/** How long each slide stays on screen. */
export const SLIDE_MS = 7000;
/** Crossfade between slides; the outgoing slide is unmounted after this. */
export const FADE_MS = 1000;
/** Local hour at which an online display reloads itself (new deploys, fresh memory). */
export const NIGHTLY_RELOAD_HOUR = 4;

/** Milliseconds from `now` until the next local `hour`:00. Exactly on the hour counts as the next day. */
export function msUntilNextReload(now: Date, hour: number = NIGHTLY_RELOAD_HOUR): number {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/display/shuffle.test.ts lib/display/schedule.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit** (only with the user's approval)

```bash
git add lib/display/shuffle.ts lib/display/schedule.ts lib/display/shuffle.test.ts lib/display/schedule.test.ts
git commit -m "feat(display): per-cycle shuffle and nightly reload timing"
```

---

### Task 3: Offline photo cache

**Files:**
- Create: `lib/display/photo-cache.ts`
- Test: `lib/display/photo-cache.test.ts`

**Interfaces:**
- Consumes: `DisplaySlide` (type only) from `./slides` (Task 1).
- Produces:
  - `DISPLAY_PHOTO_CACHE = "display-photos"`, `PHOTO_MAX_AGE_MS` (7 days)
  - `type PhotoSource = Pick<DisplaySlide, "photoUrl" | "fallbackUrl">`
  - `interface PhotoCache { sync(slides: readonly PhotoSource[], onReady?: (photoUrl: string) => void): Promise<void>; photoFor(photoUrl: string): string | null }`
  - `createPhotoCache(overrides?: Partial<PhotoCacheDeps>): PhotoCache`, where `PhotoCacheDeps = { caches, fetch, createObjectURL, revokeObjectURL, now }`

- [ ] **Step 1: Write the failing tests**

Create `lib/display/photo-cache.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/display/photo-cache.test.ts`
Expected: FAIL with `Failed to resolve import "./photo-cache"`.

- [ ] **Step 3: Implement `lib/display/photo-cache.ts`**

```ts
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
```

(`"caches" in overrides` lets a test pass `caches: undefined` explicitly. The browser path reads `globalThis.caches`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/display/photo-cache.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit** (only with the user's approval)

```bash
git add lib/display/photo-cache.ts lib/display/photo-cache.test.ts
git commit -m "feat(display): page-side offline cache for loop photos"
```

---

### Task 4: Slide components (layout B)

**Files:**
- Create: `components/display/Qr.tsx`, `components/display/Slide.tsx`, `components/display/EmptySlide.tsx`, `app/display/display.css`
- Test: `components/display/Slide.test.tsx`

**Interfaces:**
- Consumes: `DisplaySlide`, `displayUrl` from `@/lib/display/slides` (Task 1); `DiscountedPrice` from `@/components/discounted-price` (existing, `variant="hero"`, `showStartsAt`).
- Produces:
  - `<Qr value: string className?: string />`: `role="img"`, `aria-label="QR code"`, `data-qr-value={value}`
  - `<Slide slide: DisplaySlide photoSrc: string />`: root has `data-testid="display-slide"` and `data-slug`
  - `<EmptySlide />`: root has `data-testid="display-empty"`
  - CSS classes `display-fade-in` (1 s) and `display-zoom` (7 s)

- [ ] **Step 1: Write the failing test**

Create `components/display/Slide.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DisplaySlide } from "@/lib/display/slides";

// Controllable early-bird offer: getActiveOffer() reads these fields on every call.
const offer = vi.hoisted(() => ({
  value: {
    code: "TEST",
    discountRate: 0.1,
    expiresAt: new Date("2099-01-01T00:00:00Z"),
    enabled: false,
    label: "Test Offer",
    badgeText: "10% OFF",
  },
}));
vi.mock("@/lib/config/offers", () => ({ EARLY_BIRD_OFFER: offer.value }));

import EmptySlide from "./EmptySlide";
import Slide from "./Slide";

const slide: DisplaySlide = {
  slug: "a",
  name: "Lilac Blossom – Boys Co-ord Set",
  minPrice: 450,
  hasRange: false,
  photoUrl: "https://img/a_detail.webp",
  fallbackUrl: "https://img/a.jpg",
  productUrl: "https://cozyberries.in/products/a?utm_source=stall&utm_medium=display",
};

afterEach(() => {
  offer.value.enabled = false;
});

describe("Slide", () => {
  it("shows the photo as backdrop and frame, the name and the scan prompt", () => {
    render(<Slide slide={slide} photoSrc="blob:a" />);
    expect(screen.getByAltText(slide.name)).toHaveAttribute("src", "blob:a");
    expect(document.querySelectorAll('img[src="blob:a"]')).toHaveLength(2);
    expect(screen.getByRole("heading", { name: slide.name })).toBeInTheDocument();
    expect(screen.getByText(/Scan to order/)).toBeInTheDocument();
    expect(screen.getByText(/Pick up at the stall/)).toBeInTheDocument();
  });

  it("renders a real QR code for the product link", async () => {
    render(<Slide slide={slide} photoSrc="blob:a" />);
    const qr = screen.getByRole("img", { name: "QR code" });
    expect(qr).toHaveAttribute("data-qr-value", slide.productUrl);
    await waitFor(() => expect(qr.querySelector("svg")).not.toBeNull());
  });

  it("prices like the product card: plain price, Starts at for ranges", () => {
    const { rerender } = render(<Slide slide={slide} photoSrc="blob:a" />);
    expect(screen.getByText("₹450")).toBeInTheDocument();
    expect(screen.queryByText("Starts at")).not.toBeInTheDocument();
    rerender(<Slide slide={{ ...slide, hasRange: true }} photoSrc="blob:a" />);
    expect(screen.getByText("Starts at")).toBeInTheDocument();
  });

  it("shows MRP, the discounted price and the badge while an offer runs", () => {
    offer.value.enabled = true;
    render(<Slide slide={slide} photoSrc="blob:a" />);
    expect(screen.getByText("₹450")).toBeInTheDocument();
    expect(screen.getByText("₹405")).toBeInTheDocument();
    expect(screen.getByText("10% OFF")).toBeInTheDocument();
  });
});

describe("EmptySlide", () => {
  it("offers a Scan to shop QR code for the homepage", () => {
    render(<EmptySlide />);
    expect(screen.getByText("Scan to shop")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "QR code" }).getAttribute("data-qr-value")).toMatch(
      /\/\?utm_source=stall&utm_medium=display$/,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/display/Slide.test.tsx`
Expected: FAIL with `Failed to resolve import "./EmptySlide"`.

- [ ] **Step 3: Implement the components and CSS**

Create `components/display/Qr.tsx`:

```tsx
"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

interface QrProps {
  value: string;
  className?: string;
}

/** QR code rendered to inline SVG in the browser, so it keeps working offline. */
export default function Qr({ value, className = "" }: QrProps) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, { type: "svg", margin: 1, color: { dark: "#4a3426", light: "#ffffff" } })
      .then((markup) => {
        if (!cancelled) setSvg(markup);
      })
      .catch(() => {
        if (!cancelled) setSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div
      role="img"
      aria-label="QR code"
      data-qr-value={value}
      className={`aspect-square shrink-0 rounded-lg bg-white p-[0.6vmin] [&>svg]:h-full [&>svg]:w-full ${className}`}
      // Markup comes from the qrcode library for our own URL, never from user input.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
```

Create `components/display/Slide.tsx`:

```tsx
import DiscountedPrice from "@/components/discounted-price";
import type { DisplaySlide } from "@/lib/display/slides";
import Qr from "./Qr";

interface SlideProps {
  slide: DisplaySlide;
  /** Object URL from the display photo cache. */
  photoSrc: string;
}

/** Layout B: the photo framed on a blurred copy of itself, with a floating details card. */
export default function Slide({ slide, photoSrc }: SlideProps) {
  return (
    <div
      data-testid="display-slide"
      data-slug={slide.slug}
      className="display-fade-in absolute inset-0 overflow-hidden bg-[#2b1d14]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoSrc}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-75"
      />
      <div className="relative flex h-full w-full items-center justify-center gap-[4vmin] p-[4vmin] landscape:flex-row portrait:flex-col">
        <div className="aspect-square shrink-0 overflow-hidden rounded-2xl shadow-2xl landscape:h-[min(88vh,54vw)] portrait:w-[min(88vw,62vh)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoSrc} alt={slide.name} className="display-zoom h-full w-full object-cover" />
        </div>
        <div className="flex rounded-2xl bg-[rgba(255,250,244,0.92)] p-[3vmin] text-[#4a3426] shadow-xl landscape:h-[min(88vh,54vw)] landscape:w-[min(36vw,60vh)] landscape:flex-col landscape:justify-between portrait:w-[min(88vw,62vh)] portrait:flex-row portrait:items-center portrait:gap-[3vmin]">
          <div className="min-w-0 flex-1">
            <p className="text-[max(12px,1.6vmin)] font-semibold uppercase tracking-[0.18em] text-[#8a6a52]">
              CozyBerries
            </p>
            <h2 className="mt-[1.5vmin] font-serif text-[max(18px,4vmin)] leading-tight">{slide.name}</h2>
            <DiscountedPrice
              price={slide.minPrice}
              showStartsAt={slide.hasRange}
              variant="hero"
              className="mt-[1.5vmin]"
            />
          </div>
          <div className="flex items-center gap-[2vmin] landscape:flex-row portrait:flex-col">
            <Qr value={slide.productUrl} className="landscape:w-[min(16vw,28vh)] portrait:w-[min(24vw,18vh)]" />
            <p className="text-[max(12px,2vmin)] leading-snug text-[#6b5443]">
              Scan to order
              <br />
              Pick up at the stall
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

Create `components/display/EmptySlide.tsx`:

```tsx
import { displayUrl } from "@/lib/display/slides";
import Qr from "./Qr";

/** Shown when no product qualifies, or before the first photo is ready. */
export default function EmptySlide() {
  return (
    <div
      data-testid="display-empty"
      className="absolute inset-0 flex flex-col items-center justify-center gap-[4vmin] bg-[#f6efe6] p-[6vmin] text-center text-[#4a3426]"
    >
      <p className="text-[max(14px,2vmin)] font-semibold uppercase tracking-[0.18em] text-[#8a6a52]">CozyBerries</p>
      <h1 className="font-serif text-[max(22px,6vmin)] leading-tight">Soft muslin for little ones</h1>
      <Qr value={displayUrl("/")} className="w-[min(30vw,30vh)]" />
      <p className="text-[max(14px,2.6vmin)]">Scan to shop</p>
    </div>
  );
}
```

Create `app/display/display.css`:

```css
/* Stall display loop (app/display). Timings match SLIDE_MS / FADE_MS in lib/display/schedule.ts. */
@keyframes display-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes display-zoom {
  from { transform: scale(1); }
  to { transform: scale(1.04); }
}
.display-fade-in { animation: display-fade-in 1s ease-in-out both; }
.display-zoom { animation: display-zoom 7s linear both; }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/display/Slide.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit** (only with the user's approval)

```bash
git add components/display app/display/display.css
git commit -m "feat(display): layout B slide, empty card and offline QR"
```

---

### Task 5: Player, page and installable manifest

**Files:**
- Create: `app/display/DisplayClient.tsx`, `app/display/page.tsx`, `public/display.webmanifest`
- Test: `app/display/DisplayClient.test.tsx`, `app/display/page.test.ts`

**Interfaces:**
- Consumes: `selectSlides`, `DisplaySlide`, `ModelPhotoTags` (Task 1); `nextCycle`, `SLIDE_MS`, `FADE_MS`, `msUntilNextReload` (Task 2); `createPhotoCache`, `PhotoCache` (Task 3); `Slide`, `EmptySlide` (Task 4); `useCatalog` from `@/hooks/useCatalog`; `getSnapshot` from `@/lib/catalog/cache`.
- Produces:
  - `default function DisplayClient(props: { snapshot: Snapshot; tags?: ModelPhotoTags; photoCache?: PhotoCache; onReload?: () => void; random?: () => number })`
  - `STARTED_KEY = "display:started"`
  - Root element `data-testid="display-root"`
  - `app/display/page.tsx`: `metadata` with `robots: { index: false, follow: false }` and `manifest: "/display.webmanifest"`

- [ ] **Step 1: Write the failing tests**

Create `app/display/DisplayClient.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "@/lib/catalog/types";
import { SUPABASE_PRODUCTS, displayCard, displaySnapshot } from "@/lib/display/__fixtures__/cards";
import type { PhotoCache, PhotoSource } from "@/lib/display/photo-cache";
import { FADE_MS, SLIDE_MS } from "@/lib/display/schedule";
import type { ModelPhotoTags } from "@/lib/display/slides";

// useCatalog returns the server snapshot unless a test simulates a background refresh.
const catalog = vi.hoisted(() => ({ override: null as Snapshot | null }));
vi.mock("@/hooks/useCatalog", () => ({
  useCatalog: (initial: Snapshot) => ({ data: catalog.override ?? initial }),
}));
vi.mock("@/components/display/Qr", () => ({
  default: ({ value }: { value: string }) => <div data-testid="qr" data-value={value} />,
}));

import DisplayClient, { STARTED_KEY } from "./DisplayClient";

const tags: ModelPhotoTags = { checkedAt: "2026-09-25", withBaby: ["a", "b", "c"], withoutBaby: [] };
const snapshot = displaySnapshot([displayCard("a"), displayCard("b"), displayCard("c")]);
/** random() ≈ 1 makes Fisher–Yates keep snapshot order, so every cycle plays a, b, c. */
const inOrder = () => 0.999;
const photoOf = (slug: string) => `${SUPABASE_PRODUCTS}/${slug}/1_detail.webp`;

function fakePhotoCache(readySlugs: string[]) {
  const ready = new Set(readySlugs.map(photoOf));
  let notify: ((photoUrl: string) => void) | undefined;
  const cache: PhotoCache & { markReady(slug: string): void } = {
    sync: vi.fn(async (slides: readonly PhotoSource[], onReady?: (photoUrl: string) => void) => {
      notify = onReady;
      for (const s of slides) if (ready.has(s.photoUrl)) onReady?.(s.photoUrl);
    }),
    photoFor: (photoUrl) => (ready.has(photoUrl) ? `blob:${photoUrl}` : null),
    markReady(slug) {
      ready.add(photoOf(slug));
      notify?.(photoOf(slug));
    },
  };
  return cache;
}

function renderDisplay(props: Partial<ComponentProps<typeof DisplayClient>> = {}) {
  const photoCache = props.photoCache ?? fakePhotoCache(["a", "b", "c"]);
  const onReload = props.onReload ?? vi.fn();
  const view = render(
    <DisplayClient snapshot={snapshot} tags={tags} random={inOrder} {...props} photoCache={photoCache} onReload={onReload} />,
  );
  return { ...view, photoCache, onReload };
}

/** Slug of the slide on top (the current one is rendered last). */
const shownSlug = () => screen.queryAllByTestId("display-slide").at(-1)?.getAttribute("data-slug") ?? null;
const tick = (ms: number) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms);
});
const tap = () => fireEvent.click(screen.getByTestId("display-root"));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 25, 12, 0, 0));
  localStorage.clear();
  catalog.override = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (document.documentElement as { requestFullscreen?: unknown }).requestFullscreen;
  delete (navigator as { wakeLock?: unknown }).wakeLock;
});

describe("DisplayClient", () => {
  it("waits for a tap on first run, then plays and remembers it was started", async () => {
    renderDisplay();
    await tick(0);
    expect(screen.getByRole("button", { name: "Tap to start" })).toBeInTheDocument();
    expect(shownSlug()).toBeNull();
    tap();
    await tick(0);
    expect(screen.queryByRole("button", { name: "Tap to start" })).not.toBeInTheDocument();
    expect(shownSlug()).toBe("a");
    expect(localStorage.getItem(STARTED_KEY)).toBe("1");
  });

  it("resumes on its own after a reload", async () => {
    localStorage.setItem(STARTED_KEY, "1");
    renderDisplay();
    await tick(0);
    expect(screen.queryByRole("button", { name: "Tap to start" })).not.toBeInTheDocument();
    expect(shownSlug()).toBe("a");
  });

  it("advances every 7 seconds and starts a new cycle after the last slide", async () => {
    localStorage.setItem(STARTED_KEY, "1");
    renderDisplay();
    await tick(0);
    const seen = [shownSlug()];
    for (let i = 0; i < 3; i++) {
      await tick(SLIDE_MS);
      seen.push(shownSlug());
    }
    expect(seen).toEqual(["a", "b", "c", "a"]);
  });

  it("keeps at most two slides mounted and drops the old one after the crossfade", async () => {
    localStorage.setItem(STARTED_KEY, "1");
    renderDisplay();
    await tick(0);
    await tick(SLIDE_MS);
    expect(screen.getAllByTestId("display-slide")).toHaveLength(2);
    await tick(FADE_MS);
    expect(screen.getAllByTestId("display-slide")).toHaveLength(1);
  });

  it("keeps cycling when only one product qualifies", async () => {
    localStorage.setItem(STARTED_KEY, "1");
    renderDisplay({ tags: { ...tags, withBaby: ["a"] } });
    await tick(0);
    expect(shownSlug()).toBe("a");
    await tick(SLIDE_MS);
    // Crossfades onto itself: two mounted copies with distinct keys, no empty card.
    expect(screen.getAllByTestId("display-slide").map((el) => el.getAttribute("data-slug"))).toEqual(["a", "a"]);
    expect(screen.queryByTestId("display-empty")).not.toBeInTheDocument();
  });

  it("skips slides whose photo is not cached", async () => {
    localStorage.setItem(STARTED_KEY, "1");
    renderDisplay({ photoCache: fakePhotoCache(["a", "c"]) });
    await tick(0);
    expect(shownSlug()).toBe("a");
    await tick(SLIDE_MS);
    expect(shownSlug()).toBe("c");
  });

  it("shows the Scan to shop card when no product qualifies", async () => {
    localStorage.setItem(STARTED_KEY, "1");
    renderDisplay({ tags: { ...tags, withBaby: [] } });
    await tick(0);
    expect(screen.getByTestId("display-empty")).toBeInTheDocument();
    expect(screen.getByTestId("qr").getAttribute("data-value")).toMatch(/\/\?utm_source=stall&utm_medium=display$/);
  });

  it("starts playing as soon as the first photo arrives", async () => {
    localStorage.setItem(STARTED_KEY, "1");
    const photoCache = fakePhotoCache([]);
    renderDisplay({ photoCache });
    await tick(0);
    expect(screen.getByTestId("display-empty")).toBeInTheDocument();
    await act(async () => photoCache.markReady("b"));
    expect(shownSlug()).toBe("b");
  });

  it("never shows a product again once a catalog refresh removes it", async () => {
    localStorage.setItem(STARTED_KEY, "1");
    const { rerender, photoCache, onReload } = renderDisplay();
    await tick(0);
    expect(shownSlug()).toBe("a");
    catalog.override = displaySnapshot([displayCard("a"), displayCard("b", { in_stock: false }), displayCard("c")], "v2");
    rerender(<DisplayClient snapshot={snapshot} tags={tags} random={inOrder} photoCache={photoCache} onReload={onReload} />);
    await tick(SLIDE_MS);
    expect(shownSlug()).toBe("c");
  });

  it("still starts when localStorage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderDisplay();
    await tick(0);
    tap();
    await tick(0);
    expect(shownSlug()).toBe("a");
  });

  it("starts when fullscreen and wake lock do not exist", async () => {
    renderDisplay(); // jsdom implements neither API
    await tick(0);
    tap();
    await tick(0);
    expect(shownSlug()).toBe("a");
  });

  it("starts when fullscreen and wake lock reject", async () => {
    const requestFullscreen = vi.fn(() => Promise.reject(new Error("denied")));
    Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: requestFullscreen });
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request: vi.fn(() => Promise.reject(new Error("denied"))) },
    });
    renderDisplay();
    await tick(0);
    tap();
    await tick(0);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(shownSlug()).toBe("a");
  });

  it("re-requests fullscreen on a tap after an auto-resume", async () => {
    const requestFullscreen = vi.fn(async () => {});
    Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: requestFullscreen });
    localStorage.setItem(STARTED_KEY, "1");
    renderDisplay();
    await tick(0);
    tap();
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("re-requests the wake lock whenever the page becomes visible again", async () => {
    const request = vi.fn(async () => ({ release: vi.fn(async () => {}) }));
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request } });
    localStorage.setItem(STARTED_KEY, "1");
    renderDisplay();
    await tick(0);
    expect(request).toHaveBeenCalledTimes(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("reloads at 4 am only when online, otherwise tries again the next day", async () => {
    vi.setSystemTime(new Date(2026, 8, 25, 3, 59, 0));
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { onReload } = renderDisplay();
    await tick(60_000);
    expect(onReload).not.toHaveBeenCalled();
    online.mockReturnValue(true);
    await tick(24 * 60 * 60 * 1000);
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
```

Create `app/display/page.test.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ snapshot: { version: "page-test" } }));
vi.mock("@/lib/catalog/cache", () => ({
  getSnapshot: async () => ({ snapshot: mocks.snapshot, source: "redis" }),
}));
vi.mock("./DisplayClient", () => ({ default: () => null }));

import DisplayPage, { metadata } from "./page";

describe("/display page", () => {
  it("hands the catalog snapshot to the player", async () => {
    const element = await DisplayPage();
    expect(element.props.snapshot).toBe(mocks.snapshot);
  });

  it("stays out of search engines and installs as its own app", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.manifest).toBe("/display.webmanifest");
  });
});

describe("public/display.webmanifest", () => {
  const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "public/display.webmanifest"), "utf8"));

  it("opens /display fullscreen under its own name", () => {
    expect(manifest).toMatchObject({
      name: "CozyBerries Display",
      start_url: "/display",
      scope: "/display",
      display: "fullscreen",
    });
  });

  it("points at icons that exist", () => {
    for (const icon of manifest.icons) {
      expect(existsSync(path.join(process.cwd(), "public", icon.src))).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/display`
Expected: FAIL with `Failed to resolve import "./DisplayClient"` and `Failed to resolve import "./page"`.

- [ ] **Step 3: Implement the player**

Create `app/display/DisplayClient.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EmptySlide from "@/components/display/EmptySlide";
import Slide from "@/components/display/Slide";
import { useCatalog } from "@/hooks/useCatalog";
import type { Snapshot } from "@/lib/catalog/types";
import modelPhotoTags from "@/lib/display/model-photos.json";
import { createPhotoCache, type PhotoCache } from "@/lib/display/photo-cache";
import { FADE_MS, SLIDE_MS, msUntilNextReload } from "@/lib/display/schedule";
import { nextCycle } from "@/lib/display/shuffle";
import { selectSlides, type DisplaySlide, type ModelPhotoTags } from "@/lib/display/slides";

/** Set on the first tap so reloads (deploys, the nightly refresh) resume without another tap. */
export const STARTED_KEY = "display:started";

interface DisplayClientProps {
  snapshot: Snapshot;
  tags?: ModelPhotoTags;
  photoCache?: PhotoCache;
  onReload?: () => void;
  random?: () => number;
}

interface Shown {
  slide: DisplaySlide;
  /** Unique per showing, so a one-slide loop still crossfades onto itself. */
  seq: number;
}

const reloadPage = () => window.location.reload();

function readStarted(): boolean {
  try {
    return localStorage.getItem(STARTED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberStarted(): void {
  try {
    localStorage.setItem(STARTED_KEY, "1");
  } catch {
    // Storage blocked: the loop still plays; it just asks for a tap again after the next reload.
  }
}

/** Fullscreen calls may be missing, return undefined (old WebKit) or reject; none of that may stop the loop. */
function settle(call: () => Promise<void> | undefined): void {
  try {
    const pending = call();
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
  } catch {
    // Unsupported: the installed-app manifest keeps the screen chrome-free instead.
  }
}

export default function DisplayClient({
  snapshot,
  tags = modelPhotoTags,
  photoCache,
  onReload = reloadPage,
  random = Math.random,
}: DisplayClientProps) {
  const { data } = useCatalog(snapshot);
  const slides = useMemo(() => selectSlides(data ?? snapshot, tags), [data, snapshot, tags]);
  const photoKey = slides.map((s) => s.photoUrl).join("|");

  const [cache] = useState<PhotoCache>(() => photoCache ?? createPhotoCache());
  const [started, setStarted] = useState(false);
  const [readyTick, setReadyTick] = useState(0);
  const [current, setCurrent] = useState<Shown | null>(null);
  const [previous, setPrevious] = useState<Shown | null>(null);

  const slidesRef = useRef(slides);
  const currentRef = useRef<Shown | null>(null);
  const cycleRef = useRef<{ order: DisplaySlide[]; index: number }>({ order: [], index: 0 });
  const seqRef = useRef(0);

  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);

  const show = useCallback((slide: DisplaySlide | null) => {
    const next = slide ? { slide, seq: ++seqRef.current } : null;
    setPrevious(next ? currentRef.current : null);
    currentRef.current = next;
    setCurrent(next);
  }, []);

  const advance = useCallback(() => {
    // Always read the latest catalog: a product removed mid-cycle is skipped, a changed price is picked up.
    const live = new Map(slidesRef.current.map((s) => [s.slug, s] as const));
    const playable = (slug: string) => {
      const slide = live.get(slug);
      return slide && cache.photoFor(slide.photoUrl) ? slide : null;
    };
    const cycle = cycleRef.current;
    // The rest of this cycle first, then one fresh cycle.
    for (let pass = 0; pass < 2; pass++) {
      while (cycle.index < cycle.order.length) {
        const next = playable(cycle.order[cycle.index++].slug);
        if (next) {
          show(next);
          return;
        }
      }
      cycle.order = nextCycle(slidesRef.current, currentRef.current?.slide.slug ?? null, random);
      cycle.index = 0;
    }
    // Nothing playable: keep the current slide if it is still valid, otherwise show the empty card.
    if (!(currentRef.current && playable(currentRef.current.slide.slug))) show(null);
  }, [cache, random, show]);

  // Auto-resume after a reload.
  useEffect(() => {
    if (readStarted()) setStarted(true);
  }, []);

  // Keep the photo cache in step with the slides; runs before the tap too, so photos download early.
  useEffect(() => {
    let cancelled = false;
    cache
      .sync(slidesRef.current, () => {
        if (!cancelled) setReadyTick((t) => t + 1);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cache, photoKey]);

  // One timer drives the loop while started.
  useEffect(() => {
    if (!started) return;
    advance();
    const id = setInterval(advance, SLIDE_MS);
    return () => clearInterval(id);
  }, [started, advance]);

  // A photo arrived while nothing was on screen: show it now rather than at the next tick.
  useEffect(() => {
    if (started && !currentRef.current) advance();
  }, [started, readyTick, advance]);

  // Unmount the outgoing slide once the crossfade is done.
  useEffect(() => {
    if (!previous) return;
    const id = setTimeout(() => setPrevious(null), FADE_MS);
    return () => clearTimeout(id);
  }, [previous]);

  // Keep the screen awake; browsers drop the lock whenever the page is hidden.
  useEffect(() => {
    if (!started) return;
    let sentinel: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        sentinel = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        // Refused or unsupported: the device's own screen-timeout setting is the backstop.
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void request();
    };
    void request();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      sentinel?.release().catch(() => {});
    };
  }, [started]);

  // Nightly reload picks up new deploys and clears memory; offline displays try again the next night.
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const schedule = () => {
      id = setTimeout(() => (navigator.onLine ? onReload() : schedule()), msUntilNextReload(new Date()));
    };
    schedule();
    return () => clearTimeout(id);
  }, [onReload]);

  const handleTap = () => {
    if (!started) {
      rememberStarted();
      setStarted(true);
      settle(() => document.documentElement.requestFullscreen?.());
      return;
    }
    if (document.fullscreenElement) settle(() => document.exitFullscreen?.());
    else settle(() => document.documentElement.requestFullscreen?.());
  };

  const layers = [previous, current].filter((s): s is Shown => s !== null);

  return (
    <div
      data-testid="display-root"
      onClick={handleTap}
      className="fixed inset-0 z-[100] cursor-none select-none overflow-hidden bg-[#2b1d14]"
    >
      {current === null && <EmptySlide />}
      {layers.map(({ slide, seq }) => {
        const src = cache.photoFor(slide.photoUrl);
        return src ? <Slide key={seq} slide={slide} photoSrc={src} /> : null;
      })}
      {!started && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
          <button
            type="button"
            className="rounded-full bg-[#fffaf4] px-[5vmin] py-[2.5vmin] font-serif text-[max(20px,4vmin)] text-[#4a3426] shadow-2xl"
          >
            Tap to start
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement the page and manifest**

Create `app/display/page.tsx`:

```tsx
import type { Metadata } from "next";
import { getSnapshot } from "@/lib/catalog/cache";
import DisplayClient from "./DisplayClient";
import "./display.css";

export const metadata: Metadata = {
  title: "CozyBerries Display",
  robots: { index: false, follow: false },
  manifest: "/display.webmanifest",
};

// Static like `/`: the catalog snapshot comes from the `catalog`-tagged Data Cache; no request APIs here.
export default async function DisplayPage() {
  const { snapshot } = await getSnapshot();
  return <DisplayClient snapshot={snapshot} />;
}
```

Create `public/display.webmanifest`:

```json
{
  "id": "/display",
  "name": "CozyBerries Display",
  "short_name": "CB Display",
  "description": "Product photo loop for the CozyBerries stall",
  "start_url": "/display",
  "scope": "/display",
  "display": "fullscreen",
  "orientation": "any",
  "theme_color": "#2b1d14",
  "background_color": "#2b1d14",
  "lang": "en",
  "icons": [
    { "src": "/android-chrome-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/android-chrome-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-maskable-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run app/display`
Expected: PASS, 19 tests (15 in `DisplayClient.test.tsx`, 4 in `page.test.ts`), with no "unhandled rejection" errors.

- [ ] **Step 6: Commit** (only with the user's approval)

```bash
git add app/display public/display.webmanifest
git commit -m "feat(display): /display player with auto-resume, wake lock and nightly reload"
```

---

### Task 6: Site integration (no chrome, no indexing, offline page)

**Files:**
- Modify: `components/ConditionalLayout.tsx` (the `/login` / `/signup` branch)
- Modify: `app/robots.ts` (the `disallow` list)
- Create: `lib/pwa/matchers.ts`
- Modify: `app/sw.ts` (the `runtimeCaching` array and `MANAGED_PREFIXES`)
- Test: `components/ConditionalLayout.test.tsx`, `app/robots.test.ts`, `lib/pwa/matchers.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `isDisplayNavigation({ request, url }: { request: Pick<Request, "mode">; url: URL }): boolean`

- [ ] **Step 1: Write the failing tests**

Create `components/ConditionalLayout.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("@/components/header", () => ({ default: () => <header data-testid="site-header" /> }));
vi.mock("@/components/footer", () => ({ default: () => null }));
vi.mock("next/dynamic", () => ({
  default: () =>
    function BottomNav() {
      return <nav data-testid="bottom-nav" />;
    },
}));

import ConditionalLayout from "./ConditionalLayout";

function renderAt(pathname: string) {
  nav.pathname = pathname;
  return render(
    <ConditionalLayout>
      <p>page</p>
    </ConditionalLayout>,
  );
}

describe("ConditionalLayout", () => {
  it("renders the stall display without the site header or bottom nav", () => {
    renderAt("/display");
    expect(screen.getByText("page")).toBeInTheDocument();
    expect(screen.queryByTestId("site-header")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bottom-nav")).not.toBeInTheDocument();
  });

  it("keeps the header and bottom nav on shop pages", () => {
    renderAt("/products");
    expect(screen.getByTestId("site-header")).toBeInTheDocument();
    expect(screen.getByTestId("bottom-nav")).toBeInTheDocument();
  });
});
```

Create `app/robots.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots.txt", () => {
  it("keeps the stall display out of search engines", () => {
    const { rules } = robots();
    const list = Array.isArray(rules) ? rules : [rules];
    const disallow = list.flatMap((rule) =>
      Array.isArray(rule.disallow) ? rule.disallow : rule.disallow ? [rule.disallow] : [],
    );
    expect(disallow).toContain("/display");
  });
});
```

Create `lib/pwa/matchers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isDisplayNavigation } from "./matchers";

const at = (path: string, mode: RequestMode = "navigate") => ({
  request: { mode },
  url: new URL(path, "https://cozyberries.in"),
});

describe("isDisplayNavigation", () => {
  it("matches navigations to /display, with or without a query or trailing slash", () => {
    expect(isDisplayNavigation(at("/display"))).toBe(true);
    expect(isDisplayNavigation(at("/display?x=1"))).toBe(true);
    expect(isDisplayNavigation(at("/display/"))).toBe(true);
  });

  it("ignores other pages and non-navigation requests", () => {
    expect(isDisplayNavigation(at("/products"))).toBe(false);
    expect(isDisplayNavigation(at("/displayed"))).toBe(false);
    expect(isDisplayNavigation(at("/display", "cors"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run components/ConditionalLayout.test.tsx app/robots.test.ts lib/pwa/matchers.test.ts`
Expected: the ConditionalLayout `/display` case fails (the header is present), robots fails (`/display` is missing from `disallow`), and matchers fails with `Failed to resolve import "./matchers"`.

- [ ] **Step 3: Implement**

In `components/ConditionalLayout.tsx`, replace:

```tsx
  // Sign-in/sign-up flow is a standalone full-screen page — no site header/nav/footer.
  if (pathname?.startsWith("/login") || pathname?.startsWith("/signup")) {
```

with:

```tsx
  // Sign-in/sign-up and the stall display are standalone full-screen pages — no site header/nav/footer.
  if (pathname?.startsWith("/login") || pathname?.startsWith("/signup") || pathname?.startsWith("/display")) {
```

In `app/robots.ts`, add `"/display",` as the last entry of the `disallow` array, after `"/track-order/",`. There is deliberately no trailing slash: robots rules are prefix matches, so `/display` covers `/display` and `/display/…`.

Create `lib/pwa/matchers.ts`:

```ts
/** Navigations to the stall display. Lives outside app/sw.ts so it can be unit-tested. */
export function isDisplayNavigation({ request, url }: { request: Pick<Request, "mode">; url: URL }): boolean {
  return request.mode === "navigate" && (url.pathname === "/display" || url.pathname.startsWith("/display/"));
}
```

In `app/sw.ts`:

1. Add this import below the existing `serwist` import block:

```ts
import { isDisplayNavigation } from "../lib/pwa/matchers";
```

2. Insert this rule as the **first** entry of `runtimeCaching`, above the `// ── Page navigations ──` rule:

```ts
    // ── Stall display ─────────────────────────────────────────────────────────
    // /display must open even after a tablet restarts without Wi-Fi: its HTML carries the
    // catalog snapshot, so keep it 30 days instead of the 24 h used for other pages.
    // Versioned like pages-cache so it never outlives the JS chunks it references.
    {
      matcher: isDisplayNavigation,
      handler: new NetworkFirst({
        cacheName: `display-page-${v}`,
        networkTimeoutSeconds: 10,
        plugins: [
          cacheablePlugin,
          new ExpirationPlugin({ maxEntries: 2, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        ],
      }),
    },
```

3. Add `"display-page-",` to `MANAGED_PREFIXES`, after `"pages-cache-",`. Do **not** add `display-photos`: that cache is unversioned on purpose and must survive deploys.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run components/ConditionalLayout.test.tsx app/robots.test.ts lib/pwa/matchers.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit** (only with the user's approval)

```bash
git add components/ConditionalLayout.tsx components/ConditionalLayout.test.tsx app/robots.ts app/robots.test.ts lib/pwa app/sw.ts
git commit -m "feat(display): bare layout, noindex and 30-day offline page cache for /display"
```

---

### Task 7: Untagged-product check, docs and the final gate

**Files:**
- Create: `scripts/lib/display-untagged.mjs`, `scripts/display-untagged.mjs`
- Modify: `package.json` (the `scripts` block)
- Modify: `CLAUDE.md` (a new section after "### Caching Strategy")
- Test: `scripts/lib/display-untagged.test.ts`

**Interfaces:**
- Consumes: `lib/display/model-photos.json` (Task 1).
- Produces: `untaggedProducts<P extends { slug: string }>(products: P[], tags: { withBaby: string[]; withoutBaby: string[] }): P[]`

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/display-untagged.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { untaggedProducts } from "./display-untagged.mjs";

const tags = { withBaby: ["a"], withoutBaby: ["b"] };

describe("untaggedProducts", () => {
  it("returns products in neither list, in catalog order", () => {
    const products = [
      { slug: "new-2", images: [] },
      { slug: "a", images: [] },
      { slug: "b", images: [] },
      { slug: "new-1", images: ["https://img/new-1.jpg"] },
    ];
    expect(untaggedProducts(products, tags).map((p) => p.slug)).toEqual(["new-2", "new-1"]);
  });

  it("returns [] when every product is tagged", () => {
    expect(untaggedProducts([{ slug: "a" }, { slug: "b" }], tags)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/lib/display-untagged.test.ts`
Expected: FAIL with `Failed to resolve import "./display-untagged.mjs"`.

- [ ] **Step 3: Implement the helper and the script**

Create `scripts/lib/display-untagged.mjs`:

```js
/**
 * Live catalog products that lib/display/model-photos.json lists in neither withBaby nor withoutBaby.
 * @template {{ slug: string }} P
 * @param {P[]} products
 * @param {{ withBaby: string[]; withoutBaby: string[] }} tags
 * @returns {P[]}
 */
export function untaggedProducts(products, tags) {
  const known = new Set([...tags.withBaby, ...tags.withoutBaby]);
  return products.filter((product) => !known.has(product.slug));
}
```

Create `scripts/display-untagged.mjs`:

```js
#!/usr/bin/env node
// Lists live products whose first photo has not been tagged for the stall display loop.
// Usage: npm run display:untagged [-- --url=https://cozyberries.in]
// Exit codes: 0 all tagged, 1 some untagged, 2 catalog unreachable.
import { readFileSync } from "node:fs";
import { untaggedProducts } from "./lib/display-untagged.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "1"];
  }),
);
const base = (args.url ?? process.env.CATALOG_BASE_URL ?? "https://cozyberries.in").replace(/\/$/, "");
const tags = JSON.parse(readFileSync(new URL("../lib/display/model-photos.json", import.meta.url), "utf8"));

let products;
try {
  const res = await fetch(`${base}/api/catalog`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  ({ products } = await res.json());
} catch (err) {
  console.error(`Could not read ${base}/api/catalog: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
}

const missing = untaggedProducts(products, tags);
if (missing.length === 0) {
  console.log(`All ${products.length} products are tagged (tag file checked ${tags.checkedAt}).`);
  process.exit(0);
}
console.log(`${missing.length} product(s) need a look at their first photo:`);
for (const product of missing) console.log(`- ${product.slug}\t${product.images?.[0] ?? "(no image)"}`);
console.log("Add each slug to withBaby or withoutBaby in lib/display/model-photos.json, then deploy.");
process.exit(1);
```

In `package.json` `scripts`, add after `"db:test-pickup"`:

```json
    "display:untagged": "node scripts/display-untagged.mjs"
```

(Add a comma to the preceding `"db:test-pickup"` line.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/lib/display-untagged.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Document it in CLAUDE.md**

Insert this section in `CLAUDE.md` immediately before `### Path Aliases`:

```markdown
### Stall display (`/display`)
- Endless product-photo loop for the offline stall (spec: `docs/superpowers/specs/2026-09-25-stall-display-loop-design.md`). It reads the catalog snapshot exactly like `/products`; it makes no Redis or Supabase calls of its own.
- Only in-stock products listed under `withBaby` in `lib/display/model-photos.json` appear (their first photo shows a baby). New products stay hidden until tagged: run `npm run display:untagged`, look at the first photos it lists, add each slug to `withBaby` or `withoutBaby`, then deploy.
- Photos are the `1_detail.webp` variants, cached by the page itself in Cache Storage `display-photos` (refreshed after 7 days). Do not replace this with a service-worker `CacheFirst` rule on `*_detail.webp`: that would pin product-detail images for every customer. The `/display` HTML is kept 30 days in the SW cache `display-page-${v}`.
- Staff setup: open `https://cozyberries.in/display` on Wi-Fi → "Add to Home screen" / "Install app" → open **CozyBerries Display** → tap "Tap to start" once → set the device's screen timeout to "never" and exempt the browser from battery saver → leave it on Wi-Fi for a minute so all photos download (about 5 MB). After that it plays offline, resumes by itself after deploys, and reloads nightly at 4 am when online.
```

- [ ] **Step 6: Run the full gate**

Run each and confirm:

```bash
npm run lint
```
Expected: no errors. Warnings that already existed are acceptable, but there must be no new warnings in `app/display`, `components/display`, `lib/display` or `lib/pwa`.

```bash
npm run test:unit
```
Expected: every test passes, including 64 new ones across the 12 new test files.

```bash
npm run build
```
Expected: the build succeeds, and the route table lists `○ /display` (static). The service worker compiles with the new rule.

```bash
npm run display:untagged
```
Expected: `All 48 products are tagged (tag file checked 2026-09-25).` and exit code 0. If a product was added since 2026-09-25, the script lists it and exits 1. Look at its first photo, add the slug to the right list, and re-run until it exits 0.

- [ ] **Step 7: Commit** (only with the user's approval)

```bash
git add scripts/lib/display-untagged.mjs scripts/lib/display-untagged.test.ts scripts/display-untagged.mjs package.json CLAUDE.md
git commit -m "feat(display): untagged-product check and stall display docs"
```
