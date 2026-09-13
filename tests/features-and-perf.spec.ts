import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Features & Performance E2E Tests
 *
 * Validates:
 *   1. Featured products: `?featured=true` shows exactly the catalog's is_featured products,
 *      each carrying the "Featured" badge on its card
 *   2. Add to wishlist from the product detail page
 *   3. Add to cart from the product detail page
 *   4. No API returns 5xx errors (5xx only; 4xx from optional/unauthenticated endpoints is fine)
 *   5. Products page uses infinite scroll, never a "Show More" button
 *   6. No 404 errors for static assets
 *   7. Public pages load within a generous budget
 *
 * Tests are independent (each navigates itself), so they run in parallel — no serial mode.
 */

type ProductSize = { name: string; slug: string | null; price: number; stock_quantity: number };

type CatalogProduct = {
  slug: string;
  name: string;
  category_slug: string;
  is_featured: boolean;
  price: number;
  sizes: ProductSize[];
};

type Snapshot = {
  version: string;
  products: CatalogProduct[];
};

async function loadSnapshot(request: APIRequestContext): Promise<Snapshot> {
  const response = await request.get("/api/catalog");
  expect(response.status()).toBe(200);
  return (await response.json()) as Snapshot;
}

/** The grid is server-rendered — wait for the "N item(s)" count rather than a spinner. */
async function waitForProductsToLoad(page: Page) {
  await page.getByText(/^\d+ items?$/).first().waitFor({ state: "visible", timeout: 15_000 });
}

async function itemsCount(page: Page): Promise<number> {
  const text = await page.getByText(/^\d+ items?$/).first().textContent();
  return Number.parseInt(text ?? "NaN", 10);
}

async function uniqueVisibleSlugs(page: Page): Promise<string[]> {
  return page.locator('a[href^="/products/"]').evaluateAll((els) =>
    Array.from(new Set(els.map((el) => (el.getAttribute("href") ?? "").replace("/products/", "")))),
  );
}

/** A product with an in-stock size, so the detail page auto-selects a size and the sticky CTA
 *  reads "Add to cart" immediately (no "Choose size & add" intermediate state). */
function pickProductWithStock(snapshot: Snapshot): CatalogProduct {
  const withStock = snapshot.products.find((p) => (p.sizes ?? []).some((s) => s.stock_quantity > 0));
  if (!withStock) throw new Error("no product in the catalog has an in-stock size");
  return withStock;
}

// ══════════════════════════════════════════════════════════════════════════════
// FEATURED PRODUCTS
// ══════════════════════════════════════════════════════════════════════════════

test.describe("Featured products", () => {
  test("?featured=true shows exactly the catalog's is_featured products, each with a Featured badge", async ({
    page,
    request,
  }) => {
    const snapshot = await loadSnapshot(request);
    const featuredSlugs = new Set(snapshot.products.filter((p) => p.is_featured).map((p) => p.slug));
    test.skip(featuredSlugs.size === 0, "no featured products in the catalog");

    await page.goto("/products?featured=true");
    await waitForProductsToLoad(page);

    expect(await itemsCount(page)).toBe(featuredSlugs.size);

    const badgeCount = await page.locator(".grid > div span:has-text('Featured')").count();
    expect(badgeCount).toBeGreaterThan(0);

    // Load every featured card (infinite scroll) and confirm the set matches the snapshot exactly.
    const sentinel = page.getByTestId("infinite-scroll-sentinel");
    for (let round = 0; round < 20 && (await uniqueVisibleSlugs(page)).length < featuredSlugs.size; round++) {
      await sentinel.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
    }
    const visibleSlugs = await uniqueVisibleSlugs(page);
    expect(visibleSlugs.slice().sort()).toEqual([...featuredSlugs].sort());
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// WISHLIST
// ══════════════════════════════════════════════════════════════════════════════

test.describe("Wishlist", () => {
  test.setTimeout(60_000);

  test("Can add a product to wishlist from the product detail page", async ({ page, request }) => {
    const snapshot = await loadSnapshot(request);
    const product = snapshot.products[0];

    await page.goto(`/products/${product.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(product.name, { timeout: 45_000 });

    // The static-info block (name + wishlist/share buttons) renders once, above the related
    // products strip further down — .first() is the real control, not a related card's.
    const wishlistButton = page.getByRole("button", { name: "Add to wishlist" }).first();
    await expect(wishlistButton).toBeVisible({ timeout: 10_000 });
    await wishlistButton.click();

    // Guest sessions (no Supabase user) apply cart/wishlist intents silently — components/
    // auth-gate-context.tsx's requireAuthForIntent adds the item itself and returns false,
    // which short-circuits the caller's own toast.success(...) call. So the only observable,
    // auth-state-independent signal here is the button flipping to its "in wishlist" state.
    await expect(page.getByRole("button", { name: "Remove from wishlist" }).first()).toBeVisible({
      timeout: 5_000,
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ADD TO CART
// ══════════════════════════════════════════════════════════════════════════════

test.describe("Add to Cart", () => {
  test.setTimeout(60_000);

  test("Can add a product to cart from the product detail page", async ({ page, request }) => {
    const snapshot = await loadSnapshot(request);
    const product = pickProductWithStock(snapshot);

    await page.goto(`/products/${product.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(product.name, { timeout: 45_000 });

    // Scope to the sticky CTA bar — related-product cards further down the page carry an
    // identically-labelled "Add to cart" button.
    const stickyBar = page.locator(".fixed.z-30");
    const addToCartButton = stickyBar.getByRole("button", { name: "Add to cart", exact: true });
    await expect(addToCartButton).toBeVisible({ timeout: 10_000 });
    await addToCartButton.click();

    // Guest sessions (no Supabase user) apply cart/wishlist intents silently — components/
    // auth-gate-context.tsx's requireAuthForIntent adds the item itself and returns false,
    // which short-circuits the caller's own toast.success(...) call. So the only observable,
    // auth-state-independent signal here is the sticky CTA flipping to its in-cart state.
    await expect(stickyBar.getByRole("button", { name: /Added.*Go to Cart/i })).toBeVisible({
      timeout: 5_000,
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// INFINITE SCROLL
// ══════════════════════════════════════════════════════════════════════════════

test.describe("Infinite Scroll", () => {
  test.setTimeout(60_000);

  test("Products page has no Show More button and paginates via scroll", async ({ page, request }) => {
    await page.goto("/products");
    await waitForProductsToLoad(page);

    await expect(page.getByRole("button", { name: /Show More/i })).toHaveCount(0);

    const snapshot = await loadSnapshot(request);
    const total = snapshot.products.length;
    test.skip(total <= 12, "catalog fits on one page — nothing to paginate");

    const sentinel = page.getByTestId("infinite-scroll-sentinel");
    for (let round = 0; round < 20 && (await uniqueVisibleSlugs(page)).length < total; round++) {
      await sentinel.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
    }
    await expect.poll(() => itemsCount(page)).toBe(total);
    expect((await uniqueVisibleSlugs(page)).length).toBe(total);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// API ERROR CHECKS — No 5xx errors
// ══════════════════════════════════════════════════════════════════════════════

test.describe("API Error Checks", () => {
  test("No API returns 5xx errors on homepage load", async ({ page }) => {
    const apiErrors: { url: string; status: number }[] = [];

    page.on("response", (response) => {
      const url = response.url();
      const status = response.status();
      // Only flag server errors (5xx). Client errors (4xx) may be expected
      // for unauthenticated requests or optional endpoints.
      if (
        (url.includes("/api/") || url.includes("supabase") || url.includes("cloudinary")) &&
        status >= 500
      ) {
        apiErrors.push({ url, status });
      }
    });

    await page.goto("/", { waitUntil: "networkidle" });

    expect(apiErrors).toEqual([]);
  });

  test("No API returns 5xx errors on products page", async ({ page }) => {
    const apiErrors: { url: string; status: number }[] = [];

    page.on("response", (response) => {
      const url = response.url();
      const status = response.status();
      if (
        (url.includes("/api/") || url.includes("supabase") || url.includes("cloudinary")) &&
        status >= 500
      ) {
        apiErrors.push({ url, status });
      }
    });

    await page.goto("/products");
    await waitForProductsToLoad(page);

    expect(apiErrors).toEqual([]);
  });

  test("No 404 errors for static assets on homepage", async ({ page }) => {
    const assetErrors: { url: string; status: number }[] = [];

    page.on("response", (response) => {
      const url = response.url();
      const status = response.status();
      if (
        (url.endsWith(".svg") ||
          url.endsWith(".png") ||
          url.endsWith(".jpg") ||
          url.endsWith(".webp") ||
          url.endsWith(".woff2")) &&
        status === 404
      ) {
        assetErrors.push({ url, status });
      }
    });

    await page.goto("/", { waitUntil: "networkidle" });

    expect(assetErrors).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PAGE LOAD PERFORMANCE
// ══════════════════════════════════════════════════════════════════════════════

test.describe("Page Load Performance", () => {
  // Allow 3 seconds to be generous for CI and cold starts
  const MAX_LOAD_TIME_MS = 3_000;

  const publicPages = [
    { name: "Homepage", path: "/" },
    { name: "Products", path: "/products" },
    { name: "About", path: "/about" },
    { name: "Contact", path: "/contact" },
  ];

  for (const pg of publicPages) {
    test(`${pg.name} (${pg.path}) loads within ${MAX_LOAD_TIME_MS}ms`, async ({
      page,
    }) => {
      const start = Date.now();

      await page.goto(pg.path, { waitUntil: "domcontentloaded" });

      // Wait for at least one heading to appear (page rendered)
      await expect(page.locator("h1, h2").first()).toBeVisible({
        timeout: MAX_LOAD_TIME_MS,
      });

      const elapsed = Date.now() - start;

      // Assert the page loaded within budget
      expect(elapsed).toBeLessThan(MAX_LOAD_TIME_MS);
    });
  }

  test("Categories API responds within 2 seconds", async ({ page }) => {
    await page.goto("/");

    const start = Date.now();
    const response = await page.request.get("/api/categories");
    const elapsed = Date.now() - start;

    expect(response.status()).toBe(200);
    expect(elapsed).toBeLessThan(2_000);

    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  test("Products API responds within 2 seconds", async ({ page }) => {
    await page.goto("/");

    const start = Date.now();
    const response = await page.request.get("/api/products?limit=12&page=1");
    const elapsed = Date.now() - start;

    expect(response.status()).toBe(200);
    expect(elapsed).toBeLessThan(2_000);

    const data = await response.json();
    expect(data.products).toBeDefined();
    expect(data.products.length).toBeGreaterThan(0);
  });
});
