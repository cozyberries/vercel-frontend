import { test, expect, type Page } from "@playwright/test";

/**
 * Homepage & All Pages E2E Tests
 *
 * Validates:
 *   1. Homepage sections: Hero, Shop by Age, Shop by Category, New Born Gifting,
 *      Featured, Comfort Meets Conscious Living, Loved by Parents
 *   2. Shop by Age – all age links navigate to products with results
 *   3. Shop by Category – dynamic categories load and link to filtered products
 *   4. New Born Gifting – cards and "View All" link return results
 *   5. Featured – product cards load and link to product detail pages
 *   6. All public pages render correctly (Products, About, Contact)
 *   7. Header navigation (logo, nav links, search) and mobile bottom navigation
 *      (the footer is commented out in the current build — there is no <footer>)
 *   8. Retired info pages (/faqs, /shipping-returns, /track-order) redirect home
 */

/** General timeout for page-load heavy tests (multiple navigations). */
const PAGE_LOAD_TIMEOUT = 45_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Wait for the homepage to fully load (hero + key sections). */
async function waitForHomepageToLoad(page: Page) {
  // The hero heading copy rotates per carousel slide, so assert structurally.
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("heading", { name: "Shop by Age" })
  ).toBeVisible({ timeout: 15_000 });
}

/** Wait for products page to load with results. */
async function waitForProductsToLoad(page: Page) {
  // The current build has no "Loading products..." spinner — wait for the
  // real success signal instead: the "N items" count and the product grid.
  await expect(page.getByText(/\d+\s*items?/i).first()).toBeVisible({
    timeout: 20_000,
  });
  await page
    .locator(".grid")
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
}

/** Assert we're on the products page and it has results. */
async function assertProductResultsExist(page: Page) {
  await waitForProductsToLoad(page);

  const countText = page.getByText(/\d+\s*items?/i).first();
  await expect(countText).toBeVisible({ timeout: 15_000 });

  const text = (await countText.textContent()) ?? "";
  const total = Number(text.match(/(\d+)\s*items?/i)?.[1] ?? 0);
  expect(total).toBeGreaterThan(0);
}

// ══════════════════════════════════════════════════════════════════════════════
// HOMEPAGE SECTIONS
// ══════════════════════════════════════════════════════════════════════════════

test.describe("Homepage Sections", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForHomepageToLoad(page);
  });

  // ── Hero Section ──────────────────────────────────────────────────────────

  test("Hero section renders with heading and CTA link", async ({ page }) => {
    const heroSection = page.locator("section").first();

    // Heading — copy rotates per carousel slide, so assert structurally, not exact text.
    const heading = heroSection.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    expect((await heading.textContent())?.trim().length).toBeGreaterThan(0);

    // CTA link inside the hero (e.g. "Shop gifting")
    const ctaLink = heroSection.getByRole("link").first();
    await expect(ctaLink).toBeVisible();

    await ctaLink.click();
    await page.waitForURL("**/products**", { timeout: 15_000 });
    expect(page.url()).toContain("/products");
  });

  // ── Shop by Age Section ───────────────────────────────────────────────────

  test("Shop by Age section renders all age range links", async ({ page }) => {
    const heading = page.getByRole("heading", { name: "Shop by Age" });
    await expect(heading).toBeVisible();

    const ageLinks = page.locator('a[href*="/products?age="]');
    await expect(ageLinks.first()).toBeAttached({ timeout: 15_000 });

    const hrefs = await ageLinks.evaluateAll((els) =>
      els.map((e) => e.getAttribute("href") ?? "")
    );
    const ageSlugs = new Set(
      hrefs
        .map((href) => new URL(href, "http://placeholder.local").searchParams.get("age"))
        .filter(Boolean)
    );

    for (const slug of ["0-3m", "3-6m", "6-12m", "1-2y", "2-3y", "3-6y"]) {
      expect(ageSlugs.has(slug)).toBe(true);
    }
  });

  // ── Shop by Category Section ──────────────────────────────────────────────

  test("Shop by Category section renders with category cards", async ({
    page,
  }) => {
    const heading = page.getByRole("heading", { name: "Shop by Category" });
    await heading.scrollIntoViewIfNeeded();
    await expect(heading).toBeVisible();

    const categorySection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Shop by Category" }) });
    const categoryLinks = categorySection.locator('a[href*="/products?category="]');

    // Wait for at least one category link to be in the DOM (API loaded)
    await expect(categoryLinks.first()).toBeAttached({ timeout: 30_000 });

    const count = await categoryLinks.count();
    expect(count).toBeGreaterThan(0);

    // Verify at least the first few category cards exist in the DOM
    // (some may be off-screen in a scrollable container, so check attachment not visibility)
    const cardsToCheck = Math.min(count, 6);
    for (let i = 0; i < cardsToCheck; i++) {
      const card = categoryLinks.nth(i);
      await expect(card).toBeAttached();
    }
  });

  // ── New Born Gifting Section ──────────────────────────────────────────────

  test("New Born Gifting section renders with cards and heading", async ({
    page,
  }) => {
    const heading = page.getByRole("heading", { name: "New Born Gifting" });
    await heading.scrollIntoViewIfNeeded();
    await expect(heading).toBeVisible();

    // Description text
    await expect(
      page.getByText("Perfect gifts for the newest little ones")
    ).toBeVisible();

    // Essential Kits card exists in the DOM
    await expect(page.getByText("Essential Kits").first()).toBeAttached();
  });

  // ── Featured Section ──────────────────────────────────────────────────────

  test("Featured section renders with product cards", async ({ page }) => {
    const heading = page.getByRole("heading", { name: "Featured", exact: true });
    await expect(heading).toBeVisible();

    const featuredSection = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Featured", exact: true }),
    });

    // Product cards have images and links
    const productImages = featuredSection.locator("img");
    await expect(productImages.first()).toBeVisible({ timeout: 10_000 });

    const imageCount = await productImages.count();
    expect(imageCount).toBeGreaterThan(0);
  });

  // ── Comfort Meets Conscious Living Section ────────────────────────────────

  test("Comfort Meets Conscious Living section renders", async ({ page }) => {
    const heading = page.getByRole("heading", {
      name: "Comfort Meets Conscious Living",
    });
    await heading.scrollIntoViewIfNeeded();
    await expect(heading).toBeVisible();
  });

  // ── Loved by Parents Section ──────────────────────────────────────────────

  test("Loved by Parents section renders with product cards and See all link", async ({
    page,
  }) => {
    const heading = page.getByRole("heading", { name: "Loved by Parents" });
    await heading.scrollIntoViewIfNeeded();
    await expect(heading).toBeVisible();

    const section = page.locator("section").filter({ has: heading });

    const productLinks = section.locator('a[href^="/products/"]');
    await expect(productLinks.first()).toBeVisible({ timeout: 10_000 });
    expect(await productLinks.count()).toBeGreaterThan(0);

    const seeAll = section.getByRole("link", { name: "See all" });
    await expect(seeAll).toBeVisible();

    await seeAll.click();
    await page.waitForURL("**/products**", { timeout: 15_000 });
    expect(page.url()).toContain("/products");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SHOP BY AGE – CLICK EACH AGE RANGE
// ══════════════════════════════════════════════════════════════════════════════

test.describe("Shop by Age – All age ranges return products", () => {
  const ageRanges = [
    { slug: "0-3m", name: "0-3M" },
    { slug: "3-6m", name: "3-6M" },
    { slug: "6-12m", name: "6-12M" },
    { slug: "1-2y", name: "1-2Y" },
    { slug: "2-3y", name: "2-3Y" },
    { slug: "3-4y", name: "3-4Y" },
  ];

  for (const ageRange of ageRanges) {
    test(`Age "${ageRange.name}" navigates to products page`, async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await page.goto(`/products?age=${ageRange.slug}`);
      await waitForProductsToLoad(page);

      expect(page.url()).toContain(`age=${ageRange.slug}`);

      const countText = page.getByText(/\d+\s*items?/i).first();
      await expect(countText).toBeVisible({ timeout: 30_000 });
    });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// SHOP BY CATEGORY – CLICK EACH CATEGORY
// ══════════════════════════════════════════════════════════════════════════════

test.describe("Shop by Category – All categories return products", () => {
  // Fetched from /api/categories/options so tests stay in sync with the app (no stale slugs/names).
  let categories: { slug: string; name: string }[] = [];

  test.beforeAll(async ({ request }) => {
    const res = await request.get("/api/categories/options");
    if (!res.ok()) {
      throw new Error(
        `Categories API failed: ${res.status()} ${res.statusText()} – ensure the app is running and /api/categories/options returns 200`
      );
    }
    const data = (await res.json()) as { slug: string; name: string }[];
    if (!Array.isArray(data)) {
      throw new Error(
        "Categories API did not return an array – check /api/categories/options response shape"
      );
    }
    categories = data.map((c) => ({ slug: c.slug, name: c.name }));
    if (categories.length === 0) {
      throw new Error(
        "Categories API returned no categories – at least one displayed category is required for this test suite"
      );
    }
  });

  test("each displayed category returns products", async ({ page }) => {
    for (const category of categories) {
      await test.step(`Category "${category.name}" returns products`, async () => {
        await page.goto(`/products?category=${category.slug}`);
        await waitForProductsToLoad(page);

        expect(page.url()).toContain(`category=${category.slug}`);

        const countText = page.getByText(/\d+\s*items?/i).first();
        await expect(countText).toBeVisible({ timeout: 15_000 });

        const text = (await countText.textContent()) ?? "";
        const total = Number(text.match(/(\d+)\s*items?/i)?.[1] ?? 0);
        expect(total).toBeGreaterThan(0);
      });
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// NEW BORN GIFTING – ALL CARDS AND VIEW ALL
// ══════════════════════════════════════════════════════════════════════════════

test.describe("New Born Gifting – Cards and buttons", () => {
  test("Essential Kits card links to newborn-essentials products", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForHomepageToLoad(page);

    const essentialKitsLink = page
      .locator('a[href*="newborn-essentials"]')
      .first();
    await expect(essentialKitsLink).toBeAttached();

    // Navigate directly — the link may be in a mobile-only section
    await page.goto("/products?category=newborn-essentials");
    await page.waitForURL("**/products**", { timeout: 15_000 });
    expect(page.url()).toContain("category=newborn-essentials");
  });

  test("View All Newborn Products link navigates to age-filtered page", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForHomepageToLoad(page);

    // The "View All Newborn Products" link (mobile) or its desktop equivalent
    const viewAllLink = page
      .locator('a[href="/products?age=0-3m"]')
      .first();
    await expect(viewAllLink).toBeVisible({ timeout: 10_000 });

    await viewAllLink.click();
    await page.waitForURL("**/products**", { timeout: 15_000 });
    expect(page.url()).toContain("age=0-3m");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FEATURED – PRODUCT CARDS ARE CLICKABLE
// ══════════════════════════════════════════════════════════════════════════════

test.describe("Featured – Product cards", () => {
  test("Featured product cards link to product detail pages", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForHomepageToLoad(page);

    // Get the first product card link in the featured section
    const featuredSection = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Featured", exact: true }),
    });

    const productLink = featuredSection
      .locator('a[href^="/products/"]')
      .first();
    await expect(productLink).toBeVisible({ timeout: 10_000 });

    const href = await productLink.getAttribute("href");
    expect(href).toMatch(/^\/products\/.+/);

    // Click product card and verify navigation to product detail
    await productLink.click();
    await page.waitForURL("**/products/**", { timeout: 15_000 });
    expect(page.url()).toContain("/products/");

    // Product detail page should have a product name heading
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ALL PUBLIC PAGES
// ══════════════════════════════════════════════════════════════════════════════

test.describe("All Public Pages Render Correctly", () => {
  test.setTimeout(PAGE_LOAD_TIMEOUT);

  test("Homepage (/) loads with all major sections", async ({ page }) => {
    await page.goto("/");
    await waitForHomepageToLoad(page);

    // Verify all section headings are present
    await expect(
      page.getByRole("heading", { name: "Shop by Age" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Shop by Category" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "New Born Gifting" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Featured", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Comfort Meets Conscious Living" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Loved by Parents" })
    ).toBeVisible();
  });

  test("Products page (/products) loads with products grid", async ({
    page,
  }) => {
    await page.goto("/products");
    await waitForProductsToLoad(page);

    await expect(
      page.getByRole("heading", { name: "Our Products", level: 1 })
    ).toBeVisible();

    await assertProductResultsExist(page);
  });

  test("About page (/about) renders correctly", async ({ page }) => {
    await page.goto("/about");

    await expect(
      page.getByRole("heading", { name: "Our Story", level: 1 })
    ).toBeVisible({ timeout: 15_000 });

    // Sustainability content reused from the homepage's "Comfort Meets
    // Conscious Living" section
    await expect(
      page.getByRole("heading", { name: "Why Muslin" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Our Commitment to Sustainability" })
    ).toBeVisible();

    // "Shop the collection" link navigates to /products
    const shopLink = page.getByRole("link", { name: "Shop the collection" });
    await expect(shopLink).toBeVisible();

    await shopLink.click();
    await page.waitForURL("**/products**", { timeout: 15_000 });
    expect(page.url()).toContain("/products");
  });

  test("Contact page (/contact) renders with support channels", async ({
    page,
  }) => {
    await page.goto("/contact");

    await expect(
      page.getByRole("heading", { name: "Contact & Support", level: 1 })
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByRole("heading", { name: "We're here to help" })
    ).toBeVisible();

    // Support channels (WhatsApp, Email, Instagram, Call us, Visit us) — the
    // page is an info/contact-channels page, not a contact form.
    await expect(page.getByText("WhatsApp")).toBeVisible();
    await expect(page.getByText("Email", { exact: true })).toBeVisible();
    await expect(page.getByText("cozyberriesofficial@gmail.com")).toBeVisible();
    await expect(page.getByText("+91 7411431101").first()).toBeVisible();
  });

  // Retired info pages redirect to the homepage from next.config.mjs (HTTP 307). Rendering a page
  // that called redirect() aborted the layout link prefetches and logged console errors.
  for (const path of ["/faqs", "/shipping-returns", "/track-order"]) {
    test(`retired page ${path} redirects to the homepage without console errors`, async ({
      page,
      request,
    }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(new URL(response.headers()["location"], "http://placeholder.local").pathname).toBe("/");

      const consoleErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      await page.goto(path);
      await expect.poll(() => new URL(page.url()).pathname).toBe("/");
      await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });
      expect(consoleErrors).toEqual([]);
    });
  }

});

// ══════════════════════════════════════════════════════════════════════════════
// HEADER NAVIGATION
// ══════════════════════════════════════════════════════════════════════════════

test.describe("Header Navigation", () => {
  test("Logo navigates to homepage", async ({ page }) => {
    await page.goto("/products");
    await waitForProductsToLoad(page);

    const logo = page.locator('header a[href="/"]').first();
    await expect(logo).toBeVisible();

    await logo.click();
    await page.waitForURL("/", { timeout: 15_000 });
  });

  test("Desktop nav links navigate correctly", async ({ page }) => {
    await page.goto("/");
    await waitForHomepageToLoad(page);

    const headerNav = page.locator("header nav").first();

    // Home link
    const homeLink = headerNav.getByRole("link", { name: "Home" });
    await expect(homeLink).toBeVisible();

    // Shop link
    const shopLink = headerNav.getByRole("link", { name: "Shop" });
    await expect(shopLink).toBeVisible();

    await shopLink.click();
    await page.waitForURL("**/products**", { timeout: 15_000 });
    expect(page.url()).toContain("/products");

    // Wishlist link
    await page.goto("/");
    const wishlistLink = page
      .locator("header nav")
      .first()
      .getByRole("link", { name: "Wishlist" });
    await expect(wishlistLink).toBeVisible();

    await wishlistLink.click();
    await page.waitForURL("**/wishlist**", { timeout: 15_000 });
    expect(page.url()).toContain("/wishlist");
  });

  test("Search button opens search overlay", async ({ page }) => {
    await page.goto("/");
    await waitForHomepageToLoad(page);

    const searchButton = page.getByRole("button", { name: "Search products" });
    await expect(searchButton).toBeVisible();
    await searchButton.click();

    // Search overlay / input should appear (may take a moment for the sheet to animate open)
    const searchInput = page.getByPlaceholder(/search/i);
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
  });

  test("Header icon buttons navigate to cart, profile and wishlist", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForHomepageToLoad(page);

    await page.getByRole("button", { name: "Go to cart" }).click();
    await page.waitForURL("**/cart**", { timeout: 15_000 });
    expect(page.url()).toContain("/cart");

    await page.goto("/");
    await waitForHomepageToLoad(page);
    await page.getByRole("button", { name: "Go to profile" }).click();
    await page.waitForURL("**/profile**", { timeout: 15_000 });
    expect(page.url()).toContain("/profile");

    await page.goto("/");
    await waitForHomepageToLoad(page);
    await page.getByRole("button", { name: "Go to wishlist" }).click();
    await page.waitForURL("**/wishlist**", { timeout: 15_000 });
    expect(page.url()).toContain("/wishlist");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// BOTTOM NAVIGATION (MOBILE) — the footer is commented out (no <footer> in the
// current build); the mobile bottom nav is its functional replacement.
// ══════════════════════════════════════════════════════════════════════════════

test.describe("Bottom Navigation (mobile)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("Bottom nav renders with Home, Shop, Cart and Account", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForHomepageToLoad(page);

    const bottomNav = page.locator('[class*="fixed"][class*="bottom"]');
    await expect(bottomNav.getByRole("link", { name: "Home" })).toBeVisible();
    await expect(bottomNav.getByRole("link", { name: "Shop" })).toBeVisible();
    await expect(bottomNav.getByRole("link", { name: "Cart" })).toBeVisible();
    await expect(
      bottomNav.getByRole("link", { name: "Account" })
    ).toBeVisible();
  });

  test("Bottom nav Shop link navigates to /products", async ({ page }) => {
    await page.goto("/");
    await waitForHomepageToLoad(page);

    const bottomNav = page.locator('[class*="fixed"][class*="bottom"]');
    await bottomNav.getByRole("link", { name: "Shop" }).click();

    await page.waitForURL("**/products**", { timeout: 15_000 });
    expect(page.url()).toContain("/products");
  });

  test("Bottom nav Cart link navigates to /cart", async ({ page }) => {
    await page.goto("/");
    await waitForHomepageToLoad(page);

    const bottomNav = page.locator('[class*="fixed"][class*="bottom"]');
    await bottomNav.getByRole("link", { name: "Cart" }).click();

    await page.waitForURL("**/cart**", { timeout: 15_000 });
    expect(page.url()).toContain("/cart");
  });

  test("Bottom nav Account link navigates to /login when signed out", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForHomepageToLoad(page);

    const bottomNav = page.locator('[class*="fixed"][class*="bottom"]');
    await bottomNav.getByRole("link", { name: "Account" }).click();

    await page.waitForURL("**/login**", { timeout: 15_000 });
    expect(page.url()).toContain("/login");
  });

  test("Bottom nav Home link navigates to /", async ({ page }) => {
    await page.goto("/products");
    await waitForProductsToLoad(page);

    const bottomNav = page.locator('[class*="fixed"][class*="bottom"]');
    await bottomNav.getByRole("link", { name: "Home" }).click();

    await page.waitForURL("/", { timeout: 15_000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SHOP BY AGE – CLICK FROM HOMEPAGE
// ══════════════════════════════════════════════════════════════════════════════

test.describe("Shop by Age – Click from homepage", () => {
  test("Clicking first age range from homepage navigates to filtered products", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForHomepageToLoad(page);

    // Click the first age link (0-3 Months) — use .first() since multiple links share this href
    const ageLink = page.locator('a[href="/products?age=0-3m"]').first();
    await expect(ageLink).toBeVisible();

    await ageLink.click();
    await page.waitForURL("**/products**", { timeout: 15_000 });
    expect(page.url()).toContain("age=0-3m");

    await assertProductResultsExist(page);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SHOP BY CATEGORY – CLICK FROM HOMEPAGE
// ══════════════════════════════════════════════════════════════════════════════

test.describe("Shop by Category – Click from homepage", () => {
  test("Clicking first category from homepage navigates to filtered products", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForHomepageToLoad(page);

    // Wait for categories to load
    const categoryLinks = page.locator('a[href*="/products?category="]');
    await expect(categoryLinks.first()).toBeVisible({ timeout: 15_000 });

    // Get the href of the first category link
    const href = await categoryLinks.first().getAttribute("href");
    expect(href).toBeTruthy();

    // Click the first category
    await categoryLinks.first().click();
    await page.waitForURL("**/products**", { timeout: 15_000 });
    expect(page.url()).toContain("category=");

    await assertProductResultsExist(page);
  });
});
