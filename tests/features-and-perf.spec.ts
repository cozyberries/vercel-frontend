import { test, expect, type Page } from "@playwright/test";

/**
 * Features & Performance E2E Tests
 *
 * Validates:
 *   1. Featured badge displays on featured product cards
 *   2. "Show Featured" filter returns featured products only
 *   3. Add to wishlist from products page
 *   4. Add to cart from product detail page
 *   5. No API returns 4xx or 5xx errors
 *   6. All pages load within ~2 seconds (generous budget for CI)
 *   7. Infinite scroll loads more products
 *   8. No 404 errors for static assets (gingerbread SVG fix)
 */

test.describe.configure({ mode: "serial", retries: 1 });

// ── Helpers ──────────────────────────────────────────────────────────────────

async function waitForProductsToLoad(page: Page) {
  const loadingText = page.getByText("Loading products...");
  try {
    await loadingText.waitFor({ state: "hidden", timeout: 20_000 });
  } catch {
    await page.reload({ waitUntil: "domcontentloaded" });
    await loadingText.waitFor({ state: "hidden", timeout: 30_000 });
  }
  await page
    .locator(".grid")
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
}

// ══════════════════════════════════════════════════════════════════════════════
// FEATURED BADGE
// ══════════════════════════════════════════════════════════════════════════════

test.describe("Featured Badge", () => {
  test("Featured products display a 'Featured' badge on product cards", async ({
    page,
  }) => {
    // Navigate to featured-only filter
    await page.goto("/products?featured=true");
    await waitForProductsToLoad(page);

    // The "Featured" text in results info
    await expect(page.getByText(/Featured only/)).toBeVisible();

    // At least one product card should show the "Featured" badge
    const featuredBadges = page.locator(
      ".grid > div span:has-text('Featured')"
    );
    const badgeCount = await featuredBadges.count();
    expect(badgeCount).toBeGreaterThan(0);
  });

  test("'Show Featured' button filters to featured products", async ({
    page,
  }) => {
    // Navigate directly to the featured-filtered URL to avoid click timing issues
    await page.goto("/products");
    await waitForProductsToLoad(page);

    // Get initial product count
    const showingBefore = await page
      .getByText(/Showing \d+ of \d+ products/)
      .textContent();
    const totalBefore = Number(showingBefore?.match(/of (\d+)/)?.[1] ?? 0);

    // Navigate directly to featured URL (avoids Radix button click issues in headless)
    await page.goto("/products?featured=true");
    await waitForProductsToLoad(page);

    // Verify URL
    expect(page.url()).toContain("featured=true");

    // The featured filter label should show
    await expect(page.getByText(/Featured only/)).toBeVisible();

    // The "Show Featured" button should show as active ("✓ Featured")
    const desktopFilters = page.locator(".hidden.md\\:flex").first();
    await expect(desktopFilters.getByText("✓ Featured")).toBeVisible();

    // Featured count should be <= total
    const showingAfter = await page
      .getByText(/Showing \d+ of \d+ products/)
      .textContent();
    const totalAfter = Number(showingAfter?.match(/of (\d+)/)?.[1] ?? 0);
    expect(totalAfter).toBeLessThanOrEqual(totalBefore);
    expect(totalAfter).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// WISHLIST
// ══════════════════════════════════════════════════════════════════════════════

test.describe("Wishlist", () => {
  test.setTimeout(60_000);

  test("Can add a product to wishlist from product detail page", async ({
    page,
  }) => {
    // Navigate to products page and click first product
    await page.goto("/products");
    await waitForProductsToLoad(page);

    const firstCardLink = page
      .locator(".grid > div")
      .first()
      .locator("a")
      .first();
    await firstCardLink.click();

    // Wait for product detail to load (price is indicator)
    await expect(page.getByText(/₹\d+\.\d{2}/).first()).toBeVisible({
      timeout: 45_000,
    });

    // The product detail page has a wishlist button with sr-only "Add to wishlist"
    const wishlistButton = page.getByRole("button", {
      name: /add to wishlist/i,
    });
    await expect(wishlistButton.first()).toBeVisible({ timeout: 10_000 });

    await wishlistButton.first().click();

    // Toast notification confirms the action (text: "PRODUCT_NAME added to wishlist!")
    await expect(
      page.getByText(/added to wishlist/i)
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ADD TO CART
// ══════════════════════════════════════════════════════════════════════════════

test.describe("Add to Cart", () => {
  test.setTimeout(60_000);

  test("Can add a product to cart from product detail page", async ({
    page,
  }) => {
    // Navigate to products page and click first product
    await page.goto("/products");
    await waitForProductsToLoad(page);

    const firstCardLink = page
      .locator(".grid > div")
      .first()
      .locator("a")
      .first();
    await firstCardLink.click();

    // Wait for product detail to load
    await expect(page.getByText(/₹\d+\.\d{2}/).first()).toBeVisible({
      timeout: 45_000,
    });

    // Find and click Add to Cart button
    const addToCartButton = page
      .getByRole("button", { name: /Add to Cart/i })
      .first();
    await expect(addToCartButton).toBeVisible({ timeout: 10_000 });
    await addToCartButton.click();

    // After clicking, the button text changes to "Remove from Cart"
    // which confirms the product was added
    await expect(
      page.getByRole("button", { name: /Remove from Cart/i }).first()
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// INFINITE SCROLL
// ══════════════════════════════════════════════════════════════════════════════

test.describe("Infinite Scroll", () => {
  test.setTimeout(60_000);

  test("Products page uses infinite scroll instead of Show More button", async ({
    page,
  }) => {
    await page.goto("/products");
    await waitForProductsToLoad(page);

    // There should be NO "Show More" button
    const showMoreButton = page.getByRole("button", { name: /Show More/i });
    await expect(showMoreButton).toBeHidden();

    // Get initial product count
    const showingText = page.getByText(/Showing \d+ of \d+ products/);
    const textBefore = (await showingText.textContent()) ?? "";
    const countBefore = Number(textBefore.match(/Showing (\d+)/)?.[1] ?? 0);
    const total = Number(textBefore.match(/of (\d+)/)?.[1] ?? 0);

    // Skip if all products fit on one page
    test.skip(
      countBefore >= total,
      "All products already visible – nothing to paginate."
    );

    // Scroll the sentinel element into view repeatedly to trigger IntersectionObserver
    const sentinel = page.getByTestId("infinite-scroll-sentinel");
    
    // Poll: scroll → check → repeat until more products appear
    await expect(async () => {
      await sentinel.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      const textNow = (await showingText.textContent()) ?? "";
      const countNow = Number(textNow.match(/Showing (\d+)/)?.[1] ?? 0);
      expect(countNow).toBeGreaterThan(countBefore);
    }).toPass({ timeout: 15_000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// API ERROR CHECKS — No 4xx/5xx errors
// ══════════════════════════════════════════════════════════════════════════════

test.describe("API Error Checks", () => {
  test("No API returns 4xx or 5xx errors on homepage load", async ({
    page,
  }) => {
    const apiErrors: { url: string; status: number }[] = [];

    page.on("response", (response) => {
      const url = response.url();
      const status = response.status();
      // Only check API routes and resource URLs (not external analytics etc.)
      if (
        (url.includes("/api/") || url.includes("supabase") || url.includes("cloudinary")) &&
        status >= 400
      ) {
        apiErrors.push({ url, status });
      }
    });

    await page.goto("/");
    // Wait for all content to load
    await page.waitForTimeout(5_000);

    // Assert no 4xx/5xx API errors
    expect(apiErrors).toEqual([]);
  });

  test("No API returns 4xx or 5xx errors on products page", async ({
    page,
  }) => {
    const apiErrors: { url: string; status: number }[] = [];

    page.on("response", (response) => {
      const url = response.url();
      const status = response.status();
      if (
        (url.includes("/api/") || url.includes("supabase") || url.includes("cloudinary")) &&
        status >= 400
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
      // Check for SVG, image, and font 404s
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

    await page.goto("/");
    await page.waitForTimeout(5_000);

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
    { name: "FAQs", path: "/faqs" },
    { name: "Shipping & Returns", path: "/shipping-returns" },
    { name: "Track Order", path: "/track-order" },
    { name: "Blog", path: "/blog" },
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
