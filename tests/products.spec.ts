import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Products Page E2E Tests
 *
 * Validates:
 *   1. Products grid renders with correct structure (heading, item count, ₹-formatted prices)
 *   2. Filters sheet lists the Gender / Age / Size / Design option groups
 *   3. Sort sheet lists Popular / price options / Top Rated, and actually re-orders the grid
 *   4. Category chips filter the grid and update the URL via client-side navigation
 *   5. Infinite scroll appends cards until every product in the snapshot is visible
 *   6. Product detail page renders name, price, category link, size chips, quantity,
 *      the cart CTA, wishlist/share buttons, free-shipping copy and the reviews section
 *   7. Product detail page shows a thumbnail gallery for a product with multiple images
 *
 * Mobile-first: runs at 375x812 — Filters/Sort render as bottom sheets at this width, and
 * the view-toggle (grid/list) only appears on mobile.
 */
test.use({ viewport: { width: 375, height: 812 } });

type ProductSize = { name: string; slug: string | null; price: number; stock_quantity: number };

type CatalogProduct = {
  slug: string;
  name: string;
  category_slug: string;
  is_featured: boolean;
  price: number;
  min_price: number;
  description?: string;
  images: string[];
  sizes: ProductSize[];
};

type Snapshot = {
  version: string;
  products: CatalogProduct[];
  reference: { categories: Array<{ slug: string; name: string }> };
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

/** Extract the numeric price from text like "₹839" or "Starts at ₹839" → 839. */
function parsePrice(text: string): number {
  const match = text.match(/₹\s?([\d,]+)/);
  if (!match) throw new Error(`no price found in "${text}"`);
  return Number(match[1].replace(/,/g, ""));
}

/** First ₹ price text inside each currently rendered card (MRP when a sitewide offer is active — a
 *  constant discount rate, so ordering by MRP or by the discounted price is equivalent). */
async function cardPrices(page: Page): Promise<number[]> {
  const cards = page.locator(".grid > div");
  const count = await cards.count();
  const prices: number[] = [];
  for (let i = 0; i < count; i++) {
    const text = await cards.nth(i).getByText(/₹\s?\d/).first().textContent();
    if (text) prices.push(parsePrice(text));
  }
  return prices;
}

async function uniqueVisibleSlugs(page: Page): Promise<string[]> {
  return page.locator('a[href^="/products/"]').evaluateAll((els) =>
    Array.from(new Set(els.map((el) => (el.getAttribute("href") ?? "").replace("/products/", "")))),
  );
}

/** A product with 2+ images, a description and an in-stock size — exercises every optional
 *  section of the detail page instead of relying on whichever product happens to sort first. */
function pickRichProduct(snapshot: Snapshot): CatalogProduct {
  const rich = snapshot.products.find(
    (p) => (p.images?.length ?? 0) >= 2 && !!p.description && (p.sizes ?? []).some((s) => s.stock_quantity > 0),
  );
  return rich ?? snapshot.products[0];
}

test.describe("Products Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/products");
    await waitForProductsToLoad(page);
  });

  test("renders the grid with heading, item count and ₹-formatted card prices", async ({ page, request }) => {
    await expect(page.getByRole("heading", { name: "Our Products", level: 1 })).toBeVisible();

    const snapshot = await loadSnapshot(request);
    expect(await itemsCount(page)).toBe(snapshot.products.length);

    const firstCard = page.locator(".grid > div").first();
    await expect(firstCard.locator("img").first()).toBeVisible();
    await expect(firstCard.locator('a[href^="/products/"]').first()).toBeVisible();
    await expect(firstCard.getByText(/₹\s?\d[\d,]*/).first()).toBeVisible();
  });

  test("Filters sheet lists the Gender, Age, Size and Design option groups", async ({ page }) => {
    await page.getByRole("button", { name: "Filters" }).click();
    const sheet = page.getByRole("dialog", { name: "Filters" });

    await expect(sheet.getByText("Gender", { exact: true })).toBeVisible();
    for (const gender of ["Unisex", "Girl", "Boy"]) {
      await expect(sheet.getByRole("button", { name: gender, exact: true })).toBeVisible();
    }
    await expect(sheet.getByText("Age", { exact: true })).toBeVisible();
    await expect(sheet.getByText("Size", { exact: true })).toBeVisible();
    await expect(sheet.getByText("Design", { exact: true })).toBeVisible();
    for (const pattern of ["Solid", "Stripe", "Polka", "Floral", "Check"]) {
      await expect(sheet.getByRole("button", { name: pattern, exact: true })).toBeVisible();
    }
  });

  test("Sort sheet lists Popular, price options and Top Rated, and sorts the grid by price", async ({ page }) => {
    await page.getByRole("button", { name: "Sort" }).click();
    const sheet = page.getByRole("dialog", { name: "Sort by" });

    await expect(sheet.getByText("Popular", { exact: true })).toBeVisible();
    await expect(sheet.getByText("Price: Low to High", { exact: true })).toBeVisible();
    await expect(sheet.getByText("Price: High to Low", { exact: true })).toBeVisible();
    await expect(sheet.getByText("Top Rated", { exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Close" })).toBeVisible();

    await sheet.getByText("Price: Low to High", { exact: true }).click();
    await expect(page).toHaveURL(/[?&]sortBy=price(&|$)/);
    await expect(page).toHaveURL(/[?&]sortOrder=asc(&|$)/);

    // Client-side re-sort — no network round trip, just let React re-render.
    await expect.poll(() => cardPrices(page), { timeout: 10_000 }).not.toEqual([]);
    const prices = await cardPrices(page);
    expect(prices.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    }
  });

  test("category chips filter the grid and update the URL without a full navigation", async ({ page, request }) => {
    const snapshot = await loadSnapshot(request);
    const candidates = snapshot.reference.categories.filter((c) =>
      snapshot.products.some((p) => p.category_slug === c.slug),
    );
    test.skip(candidates.length === 0, "no category in the catalog has products");
    const sample = candidates.slice(0, 3);
    const navigationsBefore = await page.evaluate(() => performance.getEntriesByType("navigation").length);

    for (const category of sample) {
      const expectedSlugs = new Set(
        snapshot.products.filter((p) => p.category_slug === category.slug).map((p) => p.slug),
      );

      await page.getByRole("button", { name: category.name, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`[?&]category=${category.slug}(&|$)`));
      await expect.poll(() => itemsCount(page)).toBe(expectedSlugs.size);

      for (const slug of await uniqueVisibleSlugs(page)) {
        expect(expectedSlugs.has(slug), `${slug} rendered under category=${category.slug}`).toBe(true);
      }

      await page.getByRole("button", { name: "All", exact: true }).click();
      await expect(page).not.toHaveURL(/category=/);
    }

    // Every filter above was a soft (pushState) navigation, never a full page load.
    expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(navigationsBefore);
  });

  test("infinite scroll appends cards until every product in the snapshot is visible", async ({ page, request }) => {
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

// ── Product Detail Page ──────────────────────────────────────────────────────

test.describe("Product Detail Page", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("renders name, price, category link, size chips, quantity, cart CTA, wishlist/share and reviews", async ({
    page,
    request,
  }) => {
    const snapshot = await loadSnapshot(request);
    const product = pickRichProduct(snapshot);

    await page.goto(`/products/${product.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(product.name, { timeout: 45_000 });

    // Price, in the no-decimal ₹NNN format.
    await expect(page.getByText(/₹\s?\d[\d,]*/).first()).toBeVisible();

    // Category link back to the filtered grid.
    if (product.category_slug) {
      await expect(page.locator(`a[href="/products?category=${product.category_slug}"]`)).toBeVisible();
    }

    // Main product image.
    const mainImage = page.locator("img").first();
    await expect(mainImage).toBeVisible();
    expect(await mainImage.getAttribute("src")).toBeTruthy();

    // Size chips (auto-selected in-stock size means the CTA below reads "Add to cart", not
    // "Choose size & add").
    const inStockSize = product.sizes.find((s) => s.stock_quantity > 0);
    if (inStockSize) {
      await expect(page.getByRole("button", { name: inStockSize.name, exact: true }).first()).toBeVisible();
    }

    await expect(page.getByRole("heading", { name: "Quantity", level: 3 })).toBeVisible();

    // Sticky cart CTA — scoped to the fixed bottom bar so it isn't confused with the identical
    // "Add to cart" label on related-product cards further up the page.
    const stickyBar = page.locator(".fixed.z-30");
    await expect(stickyBar.getByRole("button", { name: "Add to cart", exact: true })).toBeVisible();

    await expect(page.getByRole("button", { name: /add to wishlist|remove from wishlist/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Share product" })).toBeVisible();

    await expect(page.getByText(/Free shipping on orders above ₹/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Reviews" })).toBeVisible();
  });

  test("shows a thumbnail gallery for a product with multiple images", async ({ page, request }) => {
    const snapshot = await loadSnapshot(request);
    const product = snapshot.products.find((p) => (p.images?.length ?? 0) >= 2);
    test.skip(!product, "no product in the catalog has more than one image");

    await page.goto(`/products/${product!.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(product!.name, { timeout: 45_000 });

    const thumbnails = page.locator(`img[alt^="${product!.name} - View"]`);
    await expect.poll(() => thumbnails.count()).toBeGreaterThanOrEqual(2);
  });
});
