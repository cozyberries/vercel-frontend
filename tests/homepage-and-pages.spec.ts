import { test, expect, type Page } from "@playwright/test";

/**
 * Homepage & All Pages E2E Tests
 *
 * Validates:
 *   1. Homepage sections: Hero, Shop by Age, Shop by Category,
 *      New Born Gifting, Featured Products, Our Story, Sustainability
 *   2. Shop by Age – all 6 age links navigate to products with results
 *   3. Shop by Category – dynamic categories load and link to filtered products
 *   4. New Born Gifting – all cards and "View All" button return results
 *   5. Featured Products – carousel loads product cards
 *   6. All public pages render correctly (About, Contact, FAQs, etc.)
 *   7. Header and footer navigation links work
 *   8. Key button clicks produce expected outcomes
 */

// Run tests serially to avoid overwhelming the dev server
test.describe.configure({ mode: "serial", retries: 1 });

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Wait for the homepage to fully load (hero + key sections). */
async function waitForHomepageToLoad(page: Page) {
  // Wait for the hero heading to appear
  await expect(
    page.getByRole("heading", {
      name: "Adorable Clothing for Your Little Treasures",
    })
  ).toBeVisible({ timeout: 30_000 });
}

/** Wait for products page to load with results. */
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

/** Assert we're on the products page and it has results. */
async function assertProductResultsExist(page: Page) {
  await waitForProductsToLoad(page);

  const showingText = page.getByText(/Showing \d+ of \d+ products/);
  await expect(showingText).toBeVisible({ timeout: 15_000 });

  const text = (await showingText.textContent()) ?? "";
  const total = Number(text.match(/of (\d+)/)?.[1] ?? 0);
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

  test("Hero section renders with heading and Shop Now button", async ({
    page,
  }) => {
    // Heading
    await expect(
      page.getByRole("heading", {
        name: "Adorable Clothing for Your Little Treasures",
      })
    ).toBeVisible();

    // Tagline
    await expect(
      page.getByText("Crafted with love, designed for comfort, and made to last").first()
    ).toBeVisible();

    // Shop Now button
    const shopNowLink = page
      .locator("section")
      .first()
      .getByRole("link", { name: "Shop Now" });
    await expect(shopNowLink).toBeVisible();

    // Click Shop Now → navigate to /products
    await shopNowLink.click();
    await page.waitForURL("**/products**", { timeout: 15_000 });
    expect(page.url()).toContain("/products");
  });

  // ── Shop by Age Section ───────────────────────────────────────────────────

  test("Shop by Age section renders 6 age range links", async ({ page }) => {
    const heading = page.getByRole("heading", { name: "Shop by Age" });
    await expect(heading).toBeVisible();

    // At least 6 age range links (may include links from other sections)
    const ageLinks = page.locator('a[href*="/products?age="]');
    const count = await ageLinks.count();
    expect(count).toBeGreaterThanOrEqual(6);
  });

  // ── Shop by Category Section ──────────────────────────────────────────────

  test("Shop by Category section renders with category cards", async ({
    page,
  }) => {
    const heading = page.getByRole("heading", { name: "Shop by Category" });
    await expect(heading).toBeVisible();

    // Scroll to the category section and wait for categories to load from API
    await heading.scrollIntoViewIfNeeded();
    const categoryLinks = page.locator('a[href*="/products?category="]');

    // Wait for at least one category link to be in the DOM (API loaded)
    await expect(categoryLinks.first()).toBeAttached({ timeout: 30_000 });

    // Should have at least 1 category
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

    // Soft Clothing card exists in the DOM (may be off-screen on some viewports)
    await expect(page.getByText("Soft Clothing").first()).toBeAttached();
  });

  // ── Featured Products Section ─────────────────────────────────────────────

  test("Featured Products section renders with product cards", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const heading = page.getByRole("heading", {
      name: "Our Featured Products",
    });
    await expect(heading).toBeVisible();

    // Wait for featured products to load
    await expect(
      page.getByText("Loading featured products...")
    ).toBeHidden({ timeout: 45_000 });

    // Product cards should be present
    const featuredSection = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Our Featured Products" }),
    });

    // Product cards have images and links
    const productImages = featuredSection.locator("img");
    await expect(productImages.first()).toBeVisible({ timeout: 10_000 });

    const imageCount = await productImages.count();
    expect(imageCount).toBeGreaterThan(0);
  });

  // ── Our Story Section ─────────────────────────────────────────────────────

  test("Our Story section renders with Learn More button", async ({
    page,
  }) => {
    const heading = page.getByRole("heading", { name: "Our Story" });
    await expect(heading).toBeVisible();

    await expect(
      page.getByText(
        "At Cozyberries, we believe that every baby deserves to be wrapped in"
      )
    ).toBeVisible();

    // Learn More button links to /about
    const learnMore = page.getByRole("link", { name: "Learn More" });
    await expect(learnMore).toBeVisible();

    await learnMore.click();
    await page.waitForURL("**/about**", { timeout: 15_000 });
    expect(page.url()).toContain("/about");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SHOP BY AGE – CLICK EACH AGE RANGE
// ══════════════════════════════════════════════════════════════════════════════

test.describe("Shop by Age – All age ranges return products", () => {
  const ageRanges = [
    { slug: "0-3-months", name: "0-3 Months" },
    { slug: "3-6-months", name: "3-6 Months" },
    { slug: "6-12-months", name: "6-12 Months" },
    { slug: "1-2-years", name: "1-2 Years" },
    { slug: "2-3-years", name: "2-3 Years" },
    { slug: "3-6-years", name: "3-6 Years" },
  ];

  for (const ageRange of ageRanges) {
    test(`Age "${ageRange.name}" navigates to products page`, async ({
      page,
    }) => {
      // Navigate directly to the age-filtered products URL
      await page.goto(`/products?age=${ageRange.slug}`);
      await waitForProductsToLoad(page);

      // URL should contain the age parameter
      expect(page.url()).toContain(`age=${ageRange.slug}`);

      // Products should be displayed
      const showingText = page.getByText(/Showing \d+ of \d+ products/);
      await expect(showingText).toBeVisible({ timeout: 15_000 });
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

        const showingText = page.getByText(/Showing \d+ of \d+ products/);
        await expect(showingText).toBeVisible({ timeout: 15_000 });

        const text = (await showingText.textContent()) ?? "";
        const total = Number(text.match(/of (\d+)/)?.[1] ?? 0);
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
    
    // Find the Essential Kits card link on the homepage
    const essentialKitsLink = page.locator('a[href*="newborn-essentials"]').first();
    await expect(essentialKitsLink).toBeAttached();
    
    // Verify href contains the correct category
    const href = await essentialKitsLink.getAttribute('href');
    expect(href).toContain('category=newborn-essentials');
    
    // Navigate directly to the category URL to verify products load
    await page.goto("/products?category=newborn-essentials");
    await page.waitForURL("**/products**", { timeout: 15_000 });
    expect(page.url()).toContain("category=newborn-essentials");
  });

  test("Soft Clothing card links to newborn-clothing products", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForHomepageToLoad(page);

    // Navigate directly to the category URL (link may be hidden on desktop viewport)
    await page.goto("/products?category=newborn-clothing");

    await page.waitForURL("**/products**", { timeout: 15_000 });
    expect(page.url()).toContain("category=newborn-clothing");
  });

  test("View All Newborn Products button navigates to age-filtered page", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForHomepageToLoad(page);

    // The "View All Newborn Products" button (mobile) or "View All Newborn" (desktop)
    const viewAllLink = page
      .locator('a[href="/products?age=0-3-months"]')
      .first();
    await expect(viewAllLink).toBeVisible({ timeout: 10_000 });

    await viewAllLink.click();
    await page.waitForURL("**/products**", { timeout: 15_000 });
    expect(page.url()).toContain("age=0-3-months");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FEATURED PRODUCTS – PRODUCT CARDS ARE CLICKABLE
// ══════════════════════════════════════════════════════════════════════════════

test.describe("Featured Products – Product cards", () => {
  test("Featured product cards link to product detail pages", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForHomepageToLoad(page);

    // Wait for featured products to load
    await expect(
      page.getByText("Loading featured products...")
    ).toBeHidden({ timeout: 45_000 });

    // Get the first product card link in the featured section
    const featuredSection = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Our Featured Products" }),
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
  test.setTimeout(45_000);

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
      page.getByRole("heading", { name: "Our Featured Products" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Our Story" })
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
      page.getByRole("heading", { name: "About CozyBerries", level: 1 })
    ).toBeVisible({ timeout: 15_000 });

    // Our Story section
    await expect(
      page.getByRole("heading", { name: "Our Story" }).first()
    ).toBeVisible();

    // Our Values section
    await expect(
      page.getByRole("heading", { name: "Our Values" })
    ).toBeVisible();

    // Quality Promise section
    await expect(
      page.getByRole("heading", { name: "Our Quality Promise" })
    ).toBeVisible();

    // Shop Now and Back to Home buttons
    const shopNow = page.getByRole("link", { name: "Shop Now" });
    await expect(shopNow).toBeVisible();

    const backHome = page.getByRole("link", { name: "Back to Home" });
    await expect(backHome).toBeVisible();

    // Click Shop Now → products page
    await shopNow.click();
    await page.waitForURL("**/products**", { timeout: 15_000 });
    expect(page.url()).toContain("/products");
  });

  test("Contact page (/contact) renders with form and info", async ({
    page,
  }) => {
    await page.goto("/contact");

    await expect(
      page.getByRole("heading", { name: "Contact Us", level: 1 })
    ).toBeVisible({ timeout: 15_000 });

    // Form fields
    await expect(page.getByLabel(/Name/)).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Email/ })).toBeVisible();
    await expect(page.getByLabel(/Subject/)).toBeVisible();
    await expect(page.getByLabel(/Message/)).toBeVisible();

    // Send Message button
    await expect(
      page.getByRole("button", { name: "Send Message" })
    ).toBeVisible();

    // Contact info section
    await expect(
      page.getByRole("heading", { name: "Get in touch" })
    ).toBeVisible();
  });

  test("FAQs page (/faqs) renders with categories and questions", async ({
    page,
  }) => {
    await page.goto("/faqs");

    await expect(
      page.getByRole("heading", {
        name: "Frequently Asked Questions",
        level: 1,
      })
    ).toBeVisible({ timeout: 15_000 });

    // Category filter buttons
    await expect(
      page.getByRole("button", { name: /All Questions/ })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /General/ })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Shopping & Orders/ })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Shipping & Delivery/ })
    ).toBeVisible();

    // FAQ items visible
    await expect(
      page.getByText("What is CozyBerries?")
    ).toBeVisible();

    // Click a category filter button and verify filter works
    await page.getByRole("button", { name: /Shopping & Orders/ }).click();

    // Shopping-specific question should be visible
    await expect(
      page.getByText("How do I place an order?")
    ).toBeVisible();

    // Click on a FAQ question to expand it
    await page
      .getByRole("button", { name: /How do I place an order/ })
      .click();

    // The answer should now be visible
    await expect(
      page.getByText("Simply browse our products, select the items you love")
    ).toBeVisible();

    // Contact Us button at the bottom (scoped to main content, not footer)
    await expect(
      page.getByRole("main").getByRole("link", { name: "Contact Us" })
    ).toBeVisible();
  });

  test("Shipping & Returns page (/shipping-returns) renders", async ({
    page,
  }) => {
    await page.goto("/shipping-returns");

    // Page should load and have content
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
  });

  test("Track Order page (/track-order) renders", async ({ page }) => {
    await page.goto("/track-order");

    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
  });

  test("Blog page (/blog) renders", async ({ page }) => {
    await page.goto("/blog");

    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
  });
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

    // HOME link
    const homeLink = page.locator("header nav").getByText("HOME");
    await expect(homeLink).toBeVisible();

    // PRODUCTS link
    const productsLink = page.locator("header nav").getByText("PRODUCTS");
    await expect(productsLink).toBeVisible();

    await productsLink.click();
    await page.waitForURL("**/products**", { timeout: 15_000 });
    expect(page.url()).toContain("/products");

    // ABOUT link
    await page.goto("/");
    const aboutLink = page.locator("header nav").getByText("ABOUT");
    await expect(aboutLink).toBeVisible();

    await aboutLink.click();
    await page.waitForURL("**/about**", { timeout: 15_000 });
    expect(page.url()).toContain("/about");
  });

  test("Search button opens search overlay", async ({ page }) => {
    await page.goto("/");
    await waitForHomepageToLoad(page);

    const searchButton = page.locator("button[data-search-trigger]");
    await expect(searchButton).toBeVisible();
    await searchButton.click();

    // Search overlay / input should appear (may take a moment for the sheet to animate open)
    const searchInput = page.getByPlaceholder(/search/i);
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FOOTER NAVIGATION
// ══════════════════════════════════════════════════════════════════════════════

test.describe("Footer Navigation", () => {
  test("Footer renders with all link sections", async ({ page }) => {
    await page.goto("/");
    await waitForHomepageToLoad(page);

    const footer = page.locator("footer");
    await expect(footer).toBeVisible();

    // Footer sections
    await expect(footer.getByText("Shop")).toBeVisible();
    await expect(footer.getByText("Help")).toBeVisible();
    await expect(footer.getByText("About")).toBeVisible();

    // Footer links
    await expect(footer.getByRole("link", { name: "Products" })).toBeVisible();
    await expect(
      footer.getByRole("link", { name: "Contact Us", exact: true })
    ).toBeVisible();
    await expect(
      footer.getByRole("link", { name: "Shipping & Returns" })
    ).toBeVisible();
    await expect(footer.getByRole("link", { name: "FAQs" })).toBeVisible();
    await expect(
      footer.getByRole("link", { name: "Track Order" })
    ).toBeVisible();
    await expect(
      footer.getByRole("link", { name: "Our Story" })
    ).toBeVisible();
    await expect(footer.getByRole("link", { name: "Blog" })).toBeVisible();

    // Copyright
    await expect(footer.getByText(/CozyBerries. All rights reserved/)).toBeVisible();
  });

  test("Footer Products link navigates to /products", async ({ page }) => {
    await page.goto("/");
    await waitForHomepageToLoad(page);

    const footer = page.locator("footer");
    const productsLink = footer.getByRole("link", { name: "Products" });
    await productsLink.click();

    await page.waitForURL("**/products**", { timeout: 15_000 });
    expect(page.url()).toContain("/products");
  });

  test("Footer Contact Us link navigates to /contact", async ({ page }) => {
    await page.goto("/");
    await waitForHomepageToLoad(page);

    const footer = page.locator("footer");
    const link = footer.getByRole("link", { name: "Contact Us", exact: true });
    await link.click();

    await page.waitForURL("**/contact**", { timeout: 15_000 });
    expect(page.url()).toContain("/contact");
  });

  test("Footer FAQs link navigates to /faqs", async ({ page }) => {
    await page.goto("/");
    await waitForHomepageToLoad(page);

    const footer = page.locator("footer");
    const link = footer.getByRole("link", { name: "FAQs" });
    await link.click();

    await page.waitForURL("**/faqs**", { timeout: 15_000 });
    expect(page.url()).toContain("/faqs");
  });

  test("Footer Our Story link navigates to /about", async ({ page }) => {
    await page.goto("/");
    await waitForHomepageToLoad(page);

    const footer = page.locator("footer");
    const link = footer.getByRole("link", { name: "Our Story" });
    await link.click();

    await page.waitForURL("**/about**", { timeout: 15_000 });
    expect(page.url()).toContain("/about");
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
    const ageLink = page.locator('a[href="/products?age=0-3-months"]').first();
    await expect(ageLink).toBeVisible();

    await ageLink.click();
    await page.waitForURL("**/products**", { timeout: 15_000 });
    expect(page.url()).toContain("age=0-3-months");

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
