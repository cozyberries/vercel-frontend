import { test, expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

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
  gender_slug: string;
  size_slugs: string[];
  age_slugs?: string[];
  color_slugs: string[];
  base_colors?: string[];
};

type Snapshot = {
  version: string;
  products: CatalogProduct[];
  reference: {
    categories: Array<{ slug: string; name: string }>;
    colors: Array<{ slug: string; name: string; base_color: string | null }>;
  };
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
  const cards = page.locator('[data-testid="product-grid"] > div');
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

    const firstCard = page.locator('[data-testid="product-grid"] > div').first();
    await expect(firstCard.locator("img").first()).toBeVisible();
    await expect(firstCard.locator('a[href^="/products/"]').first()).toBeVisible();
    await expect(firstCard.getByText(/₹\s?\d[\d,]*/).first()).toBeVisible();
  });

  test("Filters sheet lists Gender, Age bands, plus Design (prints) and Colour (base colours) from the catalog", async ({
    page,
    request,
  }) => {
    // Regression (2026-09-14): Design/Colour were hardcoded placeholders (Solid/Stripe…, Sage/Oat…)
    // that matched no product. They must come from the catalog's prints and their base colours.
    const snapshot = await loadSnapshot(request);
    const usedPrints = new Set(snapshot.products.flatMap((p) => p.color_slugs ?? []));
    const printNames = snapshot.reference.colors.filter((c) => usedPrints.has(c.slug)).map((c) => c.name);
    const baseColours = new Set(snapshot.products.flatMap((p) => p.base_colors ?? []));
    expect(printNames.length).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Filters", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Filters" });

    await expect(sheet.getByText("Gender", { exact: true })).toBeVisible();
    for (const gender of ["Unisex", "Girl", "Boy"]) {
      await expect(sheet.getByRole("button", { name: gender, exact: true })).toBeVisible();
    }
    // Age doubles as size: the six homepage bands, single years folded into "3-6 Years", no Size group.
    await expect(sheet.getByText("Age", { exact: true })).toBeVisible();
    for (const band of ["0-3M", "3-6M", "6-12M", "1-2Y", "2-3Y", "3-6 Years"]) {
      await expect(sheet.getByRole("button", { name: band, exact: true })).toBeVisible();
    }
    for (const folded of ["3-4Y", "4-5Y", "5-6Y"]) {
      await expect(sheet.getByRole("button", { name: folded, exact: true })).toHaveCount(0);
    }
    await expect(sheet.getByText("Size", { exact: true })).toHaveCount(0);

    await expect(sheet.getByText("Design", { exact: true })).toBeVisible();
    for (const name of printNames) {
      await expect(sheet.getByRole("button", { name, exact: true })).toBeVisible();
    }
    for (const placeholder of ["Solid", "Stripe", "Polka", "Floral", "Check", "Sage", "Oat", "Clay"]) {
      await expect(sheet.getByRole("button", { name: placeholder, exact: true })).toHaveCount(0);
    }
    if (baseColours.size > 0) {
      await expect(sheet.getByText("Colour", { exact: true })).toBeVisible();
      await expect(sheet.locator('button[aria-pressed]').filter({ has: page.locator("span.rounded-full") })).toHaveCount(
        baseColours.size,
      );
    }
  });

  test("Choosing a Design filters the grid to that print and writes ?design=", async ({ page, request }) => {
    const snapshot = await loadSnapshot(request);
    const counts = new Map<string, number>();
    for (const p of snapshot.products) for (const slug of p.color_slugs ?? []) counts.set(slug, (counts.get(slug) ?? 0) + 1);
    const [slug, expected] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
    const name = snapshot.reference.colors.find((c) => c.slug === slug)?.name ?? slug;
    expect(expected).toBeLessThan(snapshot.products.length);

    await page.getByRole("button", { name: "Filters", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Filters" });
    await sheet.getByRole("button", { name, exact: true }).click();
    await sheet.getByRole("button", { name: /^Show \d+ items$/ }).click();

    await expect(page).toHaveURL(new RegExp(`[?&]design=${slug}(&|$)`));
    await waitForProductsToLoad(page);
    expect(await itemsCount(page)).toBe(expected);

    // The applied filter is visible on the results screen and removable on its own.
    const applied = page.getByLabel("Applied filters");
    await expect(applied.getByText(name, { exact: true })).toBeVisible();
    // The header search icon must keep the filter and only focus the search box.
    await page.getByRole("button", { name: "Search products" }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]design=${slug}(&|$)`));
    await expect(page.getByPlaceholder("Search organic muslin, gifts…")).toBeFocused();
    await applied.getByRole("button", { name: `Remove Design filter ${name}` }).click();
    await expect(page).not.toHaveURL(/[?&]design=/);
  });

  // ── Every filter group in the sheet, applied for real: URL param, item count, applied chip ──
  test.describe("Filter options", () => {
    const THREE_TO_SIX = ["3-4y", "4-5y", "5-6y"];
    const inAgeBand = (p: CatalogProduct) => p.age_slugs?.includes("3-6y") ?? p.size_slugs.some((s) => THREE_TO_SIX.includes(s));
    const baseColourSlug = (name: string) => name.trim().toLowerCase().replace(/\s+/g, "-");

    async function applyFromSheet(page: Page, pick: (sheet: Locator) => Promise<void>) {
      await page.getByRole("button", { name: "Filters", exact: true }).click();
      const sheet = page.getByRole("dialog", { name: "Filters" });
      await pick(sheet);
      await sheet.getByRole("button", { name: /^Show \d+ items$/ }).click();
      await expect(sheet).toBeHidden();
      await waitForProductsToLoad(page);
    }

    /** The most-used base colour, with the display name the sheet shows for it. */
    function pickColour(snapshot: Snapshot): { slug: string; name: string; count: number } {
      const counts = new Map<string, number>();
      for (const p of snapshot.products) for (const c of p.base_colors ?? []) counts.set(c, (counts.get(c) ?? 0) + 1);
      const [slug, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
      const name = snapshot.reference.colors.map((c) => c.base_color?.trim() ?? "").find((n) => n && baseColourSlug(n) === slug) ?? slug;
      return { slug, name, count };
    }

    test("Gender: Girl shows girl and unisex products and writes ?gender=", async ({ page, request }) => {
      const snapshot = await loadSnapshot(request);
      const expected = snapshot.products.filter((p) => ["girl", "unisex"].includes(p.gender_slug)).length;
      await applyFromSheet(page, (sheet) => sheet.getByRole("button", { name: "Girl", exact: true }).click());
      await expect(page).toHaveURL(/[?&]gender=Girl(&|$)/);
      expect(await itemsCount(page)).toBe(expected);
      await expect(page.getByLabel("Applied filters").getByText("Girl", { exact: true })).toBeVisible();
    });

    test("Age: 3-6 Years shows every product with a 3-4Y, 4-5Y or 5-6Y size and writes ?age=3-6y", async ({ page, request }) => {
      const snapshot = await loadSnapshot(request);
      const expected = snapshot.products.filter(inAgeBand).length;
      expect(expected).toBeGreaterThan(0);
      await applyFromSheet(page, (sheet) => sheet.getByRole("button", { name: "3-6 Years", exact: true }).click());
      await expect(page).toHaveURL(/[?&]age=3-6y(&|$)/);
      expect(await itemsCount(page)).toBe(expected);
      await expect(page.getByLabel("Applied filters").getByText("3-6 Years", { exact: true })).toBeVisible();
    });

    test("Colour: the chosen swatch shows a tick, filters by base colour and writes ?colour=", async ({ page, request }) => {
      const snapshot = await loadSnapshot(request);
      const colour = pickColour(snapshot);
      expect(colour.count).toBeLessThan(snapshot.products.length);
      await applyFromSheet(page, async (sheet) => {
        const swatch = sheet.getByRole("button", { name: colour.name, exact: true });
        await expect(swatch.getByTestId("swatch-check")).toHaveCount(0);
        await swatch.click();
        await expect(swatch).toHaveAttribute("aria-pressed", "true");
        await expect(swatch.getByTestId("swatch-check")).toBeVisible();
      });
      await expect(page).toHaveURL(new RegExp(`[?&]colour=${colour.slug}(&|$)`));
      expect(await itemsCount(page)).toBe(colour.count);
      await expect(page.getByLabel("Applied filters").getByText(colour.name, { exact: true })).toBeVisible();
    });

    test("Age and Colour combine (intersection), and removing one chip keeps the other", async ({ page, request }) => {
      const snapshot = await loadSnapshot(request);
      // Pick the base colour with the largest overlap with the 3-6 Years band.
      const overlap = new Map<string, number>();
      for (const p of snapshot.products.filter(inAgeBand)) for (const c of p.base_colors ?? []) overlap.set(c, (overlap.get(c) ?? 0) + 1);
      const best = [...overlap.entries()].sort((a, b) => b[1] - a[1])[0];
      test.skip(!best, "no product has both a 3-6 Years size and a base colour");
      const [slug, expected] = best!;
      const name = snapshot.reference.colors.map((c) => c.base_color?.trim() ?? "").find((n) => n && baseColourSlug(n) === slug) ?? slug;

      await applyFromSheet(page, async (sheet) => {
        await sheet.getByRole("button", { name: "3-6 Years", exact: true }).click();
        await sheet.getByRole("button", { name, exact: true }).click();
      });
      await expect(page).toHaveURL(/[?&]age=3-6y(&|$)/);
      await expect(page).toHaveURL(new RegExp(`[?&]colour=${slug}(&|$)`));
      expect(await itemsCount(page)).toBe(expected);

      await page.getByLabel("Applied filters").getByRole("button", { name: "Remove Age filter 3-6 Years" }).click();
      await expect(page).not.toHaveURL(/[?&]age=/);
      await expect(page).toHaveURL(new RegExp(`[?&]colour=${slug}(&|$)`));
      await waitForProductsToLoad(page);
      expect(await itemsCount(page)).toBe(snapshot.products.filter((p) => p.base_colors?.includes(slug)).length);
    });

    test("Re-opening the sheet pre-selects the applied options; tapping one again deselects it", async ({ page }) => {
      await applyFromSheet(page, (sheet) => sheet.getByRole("button", { name: "Boy", exact: true }).click());
      await page.getByRole("button", { name: "Filters", exact: true }).click();
      const sheet = page.getByRole("dialog", { name: "Filters" });
      const boy = sheet.getByRole("button", { name: "Boy", exact: true });
      await expect(boy).toHaveAttribute("aria-pressed", "true");
      await boy.click();
      await expect(boy).toHaveAttribute("aria-pressed", "false");
      await sheet.getByRole("button", { name: /^Show \d+ items$/ }).click();
      await expect(page).not.toHaveURL(/[?&]gender=/);
    });

    test("Clear all filters resets the URL and shows the whole catalog again", async ({ page, request }) => {
      const snapshot = await loadSnapshot(request);
      await applyFromSheet(page, (sheet) => sheet.getByRole("button", { name: "Girl", exact: true }).click());
      expect(await itemsCount(page)).toBeLessThan(snapshot.products.length);
      await page.getByRole("button", { name: "Clear all filters" }).click();
      await expect(page).toHaveURL(/\/products\/?$/);
      await waitForProductsToLoad(page);
      expect(await itemsCount(page)).toBe(snapshot.products.length);
      await expect(page.getByLabel("Applied filters")).toHaveCount(0);
    });
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
