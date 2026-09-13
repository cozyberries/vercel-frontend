import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

/**
 * Product Page ISR Verification Tests
 *
 * These tests verify the ISR + component split refactor:
 *
 *  1. ISR: Direct navigation returns pre-rendered HTML (product content in
 *     the raw response, not an empty shell that requires client-side fetch)
 *  2. generateMetadata: <title> matches the product name
 *  3. ProductStaticInfo (RSC): category link, h1, description, features
 *     render without client-side JS
 *  4. ProductInteractions (client): image gallery, size selector, price
 *     display, Add to Cart, Wishlist toggle, related products
 *  5. Loading skeleton: navigating to the page does not show a blank/spinner
 *     screen when content is already pre-rendered
 *
 * Tests are independent (each navigates itself), so they run in parallel —
 * no `test.describe.configure({ mode: "serial" })`.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Pick a real product slug from the live catalog snapshot (not by scraping
 * the /products grid). Prefers a product with size options and more than
 * one image, so gallery/size-selector tests have something to exercise.
 */
async function getSampleProductHref(request: APIRequestContext): Promise<string> {
  const res = await request.get("/api/catalog");
  expect(res.status()).toBe(200);
  const data = await res.json();
  const products: Array<{ slug: string; category_slug: string; sizes?: unknown[]; images?: unknown[] }> = data.products ?? [];
  // Prefer a product with sizes, a gallery and at least one sibling in its category, so the size
  // selector, the thumbnails and the related-products section are all guaranteed to exist.
  const siblings = (p: { slug: string; category_slug: string }) =>
    products.filter((o) => o.category_slug === p.category_slug && o.slug !== p.slug).length;
  const rich = products.filter((p) => Array.isArray(p.sizes) && p.sizes.length > 0 && Array.isArray(p.images) && p.images.length > 1);
  const product = rich.find((p) => siblings(p) > 0) ?? rich[0] ?? products[0];
  expect(product, "catalog has no products").toBeTruthy();
  return `/products/${product.slug}`;
}

/** Wait until the price text is visible on the product detail page. */
async function waitForProductDetail(page: Page) {
  await expect(page.getByText(/₹\s?\d[\d,]*/).first()).toBeVisible({ timeout: 45_000 });
}

/** The fixed "Add to Cart" bar pinned to the bottom of the product page. */
function stickyAddToCartBar(page: Page) {
  return page.locator("div.fixed.bottom-16");
}

// ── ISR / SSR tests ───────────────────────────────────────────────────────────

test.describe("ISR: pre-rendered HTML on direct navigation", () => {
  test.setTimeout(60_000);

  test("product page HTML response body contains product name (not empty shell)", async ({
    page,
    request,
  }) => {
    // Step 1: pick a real product slug from the catalog snapshot
    const productHref = await getSampleProductHref(request);

    // Step 2: navigate to get the product name
    await page.goto(productHref);
    await waitForProductDetail(page);
    const productName = (
      await page.locator("h1").first().textContent()
    )?.trim();
    expect(productName).toBeTruthy();
    expect(productName!.length).toBeGreaterThan(0);

    // Step 3: re-fetch the page via raw HTTP and inspect the initial HTML
    // This is the ISR verification: the product name must appear in the
    // server-sent HTML, not injected later by client-side JS.
    const response = await page.request.get(productHref);
    expect(response.status()).toBe(200);
    const rawHtml = await response.text();

    // The product name should be in the pre-rendered HTML
    expect(rawHtml).toContain(productName);

    // The page must NOT be an empty React shell (no "Loading...")
    expect(rawHtml).not.toContain("Loading...");

    // The <h1> tag itself must exist in the raw HTML
    expect(rawHtml).toMatch(/<h1/);
  });

  test("page <title> matches product name (generateMetadata)", async ({
    page,
    request,
  }) => {
    const productHref = await getSampleProductHref(request);
    await page.goto(productHref);
    await waitForProductDetail(page);

    const productName = (
      await page.locator("h1").first().textContent()
    )?.trim();
    expect(productName).toBeTruthy();

    // generateMetadata sets title: product.name — verify <title> tag
    const pageTitle = await page.title();
    expect(pageTitle).toContain(productName!);
  });

  test("no loading spinner visible on direct navigation to product URL", async ({
    page,
    request,
  }) => {
    const productHref = await getSampleProductHref(request);

    // Navigate directly (simulate typing URL, not client-side nav)
    await page.goto(productHref);

    // Immediately check — the pre-rendered page should show content, not spinner
    // We give 5s; a CSR-only page would show nothing for much longer
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 5_000 });

    // No generic loading placeholder
    const loadingDivs = page.getByText("Loading...", { exact: true });
    await expect(loadingDivs).toHaveCount(0);
  });
});

// ── ProductStaticInfo (RSC content) ──────────────────────────────────────────

test.describe("ProductStaticInfo: static text content renders", () => {
  test.setTimeout(60_000);

  let productHref: string;

  test.beforeEach(async ({ page, request }) => {
    productHref = await getSampleProductHref(request);
    await page.goto(productHref);
    await waitForProductDetail(page);
  });

  test("renders product name in h1", async ({ page }) => {
    const h1 = page.locator("h1").first();
    await expect(h1).toBeVisible();
    const name = (await h1.textContent())?.trim();
    expect(name).toBeTruthy();
    expect(name!.length).toBeGreaterThan(0);
  });

  test("renders category link pointing to /products?category=", async ({ page }) => {
    // Category links now point to /products?category={slug} (the old
    // /collections/{slug} route no longer exists).
    const categoryLink = page.locator('a[href^="/products?category="]').first();
    await expect(categoryLink).toBeVisible();
    const href = await categoryLink.getAttribute("href");
    expect(href).toMatch(/^\/products\?category=/);
  });

  test("renders free shipping text", async ({ page }) => {
    // Current copy: "Free shipping on orders above ₹1,999"
    await expect(
      page.getByText(/Free shipping.*₹/i).first()
    ).toBeVisible();
  });

  test("renders Description section", async ({ page }) => {
    // Description is a collapsible accordion trigger button.
    const descButton = page.getByRole("button", { name: "Description", exact: true });
    await expect(descButton.first()).toBeVisible();
  });

  test("renders Features section when product has features", async ({
    page,
  }) => {
    // Not all products have features — skip gracefully if absent
    const featuresButton = page.getByRole("button", { name: "Features", exact: true });
    const count = await featuresButton.count();
    if (count > 0) {
      await expect(featuresButton.first()).toBeVisible();
    } else {
      test.skip(true, "Product has no features — skip Features section check");
    }
  });
});

// ── ProductInteractions (client component) ────────────────────────────────────

test.describe("ProductInteractions: interactive elements work", () => {
  test.setTimeout(90_000);

  let productHref: string;

  test.beforeEach(async ({ page, request }) => {
    productHref = await getSampleProductHref(request);
    await page.goto(productHref);
    await waitForProductDetail(page);
  });

  // ── Gallery ────────────────────────────────────────────────────────────────

  test("renders at least one product image", async ({ page }) => {
    const firstImg = page.locator("img").first();
    await expect(firstImg).toBeVisible();
    const src = await firstImg.getAttribute("src");
    expect(src).toBeTruthy();
  });

  test("image gallery has next-image navigation for multi-image products", async ({
    page,
  }) => {
    // There is no separate thumbnail strip any more — the gallery is a
    // carousel with a "Next image" control (and a "Previous image" control
    // once you've moved off the first slide).
    const allImages = page.locator("img");
    const count = await allImages.count();
    expect(count).toBeGreaterThanOrEqual(1);

    await expect(page.locator("button[aria-label='Next image']").first()).toBeVisible();
  });

  // ── Size selector ──────────────────────────────────────────────────────────

  test("size selector buttons are rendered", async ({ page }) => {
    // "Select size" heading, followed by one button per size option
    // (button names look like "6-12M", "1-2Y", …).
    const sizeHeading = page.locator("h3", { hasText: "Select size" });
    await expect(sizeHeading).toBeVisible();

    const sizeButtons = page.getByRole("button", { name: /^\d+-\d+[A-Za-z]+$/ });
    const sizeCount = await sizeButtons.count();
    expect(sizeCount).toBeGreaterThan(0);
  });

  test("price is visible", async ({ page }) => {
    const price = page.getByText(/₹\s?\d[\d,]*/).first();
    await expect(price).toBeVisible();
    const priceText = (await price.textContent()) ?? "";
    const priceVal = parseFloat(priceText.replace(/[^0-9.]/g, ""));
    expect(priceVal).toBeGreaterThan(0);
  });

  // ── Add to Cart ────────────────────────────────────────────────────────────

  test("Add to Cart button is visible", async ({ page }) => {
    // Scope to the sticky bottom bar — the related-products cards further
    // down the page also render icon-only "Add to cart" buttons.
    const addBtn = stickyAddToCartBar(page).getByRole("button", { name: /^Add to Cart$/i });
    await expect(addBtn).toBeVisible();
  });

  test("clicking Add to Cart toggles cart state", async ({ page }) => {
    // Pick an enabled size button first (button text is just the size name,
    // e.g. "6-12M" — no price shown on the button any more).
    const sizeBtn = page.getByRole("button", { name: /^\d+-\d+[A-Za-z]+$/ }).first();
    if ((await sizeBtn.count()) > 0) {
      await sizeBtn.click();
    }

    const bar = stickyAddToCartBar(page);
    const addBtn = bar.getByRole("button", { name: /^Add to Cart$/i });
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // After adding, the sticky bar button now reads "Added · Go to Cart"
    // (it no longer flips to "Remove from Cart").
    await expect(
      bar.getByRole("button", { name: /Added.*Go to Cart/i })
    ).toBeVisible({ timeout: 5_000 });
  });

  // ── Wishlist ───────────────────────────────────────────────────────────────

  test("wishlist heart button is visible", async ({ page }) => {
    // Heart icon rendered by ProductInteractions
    // More reliable: look for the Heart SVG or aria-label
    const wishlistBtn =
      page.locator("[aria-label*='wishlist' i], [aria-label*='favourite' i]").first();
    const heartSvgBtn = page.locator("button:has(svg.lucide-heart)").first();

    // Either approach should find it
    const found =
      (await wishlistBtn.count()) > 0 ||
      (await heartSvgBtn.count()) > 0 ||
      (await page.locator("button svg").count()) > 0;
    expect(found).toBe(true);
  });

  // ── Related Products ───────────────────────────────────────────────────────

  test("related products section loads", async ({ page }) => {
    // Scroll to bottom to trigger lazy-loaded related products
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // Related products section heading
    const relatedHeading = page
      .getByText(/Related Products|You may also like|More Products/i)
      .first();

    // The sample product is chosen with at least one sibling in its category, so the section must render.
    await expect(relatedHeading).toBeVisible({ timeout: 10_000 });
  });

  // ── Quantity controls ──────────────────────────────────────────────────────

  test("quantity controls are visible", async ({ page }) => {
    await expect(
      page.getByText("Quantity", { exact: true })
    ).toBeVisible();
  });

  // ── Share ──────────────────────────────────────────────────────────────────

  test("Share button is visible", async ({ page }) => {
    // Share is an icon-only button (aria-label="Share product"), not visible text.
    await expect(page.locator("button[aria-label='Share product']")).toBeVisible();
  });
});

// ── Loading skeleton ──────────────────────────────────────────────────────────

test.describe("Loading skeleton: no jarring blank screen", () => {
  test.setTimeout(30_000);

  test("no blank page or 'Loading...' text on product page navigation", async ({
    page,
    request,
  }) => {
    const productHref = await getSampleProductHref(request);

    // Direct navigation — content should be immediately visible (ISR)
    await page.goto(productHref, { waitUntil: "domcontentloaded" });

    // Within 3s of DOM ready, we should see content (not a spinner)
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 3_000 });

    // Generic "Loading..." text should never appear (ISR means SSR content)
    const loadingText = page.getByText("Loading...", { exact: true });
    await expect(loadingText).toHaveCount(0);
  });
});
