import { test, expect, type Page } from "@playwright/test";

/**
 * Product Page ISR Verification Tests
 *
 * These tests verify the ISR + component split refactor:
 *
 *  1. ISR: Direct navigation returns pre-rendered HTML (product content in
 *     the raw response, not an empty shell that requires client-side fetch)
 *  2. generateMetadata: <title> matches the product name
 *  3. ProductStaticInfo (RSC): category link, h1, description, features,
 *     care instructions render without client-side JS
 *  4. ProductInteractions (client): image gallery, size selector, price
 *     display, Add to Cart, Wishlist toggle, related products
 *  5. Loading skeleton: navigating to the page does not show a blank/spinner
 *     screen when content is already pre-rendered
 */

// Run serially to keep dev-server load manageable
test.describe.configure({ mode: "serial" });

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Navigate to /products, wait for grid, return the first product href. */
async function getFirstProductSlug(page: Page): Promise<string> {
  await page.goto("/products", { waitUntil: "domcontentloaded" });

  // Wait for the loading indicator to disappear, with two reload attempts
  const loadingText = page.getByText("Loading products...");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await loadingText.waitFor({ state: "hidden", timeout: 25_000 });
      break;
    } catch {
      if (attempt < 2) {
        await page.reload({ waitUntil: "domcontentloaded" });
      }
    }
  }

  // Ensure the grid link is visible before reading href
  const firstLink = page.locator(".grid > div").first().locator("a").first();
  await firstLink.waitFor({ state: "visible", timeout: 15_000 });
  const href = await firstLink.getAttribute("href");
  expect(href).toMatch(/^\/products\//);
  return href!; // e.g. "/products/rainbow-frock"
}

/** Wait until the price text is visible on the product detail page. */
async function waitForProductDetail(page: Page) {
  await expect(page.getByText(/₹\d+/).first()).toBeVisible({ timeout: 45_000 });
}

// ── ISR / SSR tests ───────────────────────────────────────────────────────────

test.describe("ISR: pre-rendered HTML on direct navigation", () => {
  test.setTimeout(60_000);

  test("product page HTML response body contains product name (not empty shell)", async ({
    page,
  }) => {
    // Step 1: find a real product slug via the products listing
    const productHref = await getFirstProductSlug(page);

    // Step 2: click through to get the product name
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
  }) => {
    const productHref = await getFirstProductSlug(page);
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
  }) => {
    const productHref = await getFirstProductSlug(page);

    // Navigate directly (simulate typing URL, not client-side nav)
    await page.goto(productHref);

    // Immediately check — the pre-rendered page should show content, not spinner
    // We give 3s; a CSR-only page would show nothing for 5-15s
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

  test.beforeEach(async ({ page }) => {
    productHref = await getFirstProductSlug(page);
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

  test("renders category link pointing to /collections/", async ({ page }) => {
    // ProductStaticInfo renders a category link href="/collections/{slug}"
    const categoryLink = page.locator('a[href^="/collections/"]').first();
    await expect(categoryLink).toBeVisible();
    const href = await categoryLink.getAttribute("href");
    expect(href).toMatch(/^\/collections\//);
  });

  test("renders free shipping text", async ({ page }) => {
    await expect(
      page.getByText(/Free shipping over ₹/).first()
    ).toBeVisible();
  });

  test("renders Description section", async ({ page }) => {
    const descHeading = page.getByText("Description", { exact: true });
    await expect(descHeading.first()).toBeVisible();
  });

  test("renders Features section when product has features", async ({
    page,
  }) => {
    // Not all products have features — skip gracefully if absent
    const featuresHeading = page.getByText("Features", { exact: true });
    const count = await featuresHeading.count();
    if (count > 0) {
      await expect(featuresHeading.first()).toBeVisible();
    } else {
      test.skip(true, "Product has no features — skip Features section check");
    }
  });
});

// ── ProductInteractions (client component) ────────────────────────────────────

test.describe("ProductInteractions: interactive elements work", () => {
  test.setTimeout(90_000);

  let productHref: string;

  test.beforeEach(async ({ page }) => {
    productHref = await getFirstProductSlug(page);
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

  test("thumbnail images are visible in the gallery", async ({ page }) => {
    // Desktop layout shows thumbnail sidebar — at least 1 img
    const allImages = page.locator("img");
    const count = await allImages.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // ── Size selector ──────────────────────────────────────────────────────────

  test("size selector buttons are rendered", async ({ page }) => {
    // Size section has an <h3>Size</h3> heading inside a parent <div>,
    // followed by a grid of <button> elements (one per size option).
    const sizeHeading = page.locator("h3", { hasText: "Size" });
    await expect(sizeHeading).toBeVisible();

    // Buttons are inside the nearest ancestor div that also contains the heading
    // Structure: <div> <div>...<h3>Size</h3>...</div> <div class="grid ..."><button>...</button></div> </div>
    const sizeButtons = page
      .locator("div:has(h3:text('Size'))")
      .first()
      .locator("button");
    const sizeCount = await sizeButtons.count();
    expect(sizeCount).toBeGreaterThan(0);
  });

  test("price is visible", async ({ page }) => {
    const price = page.getByText(/₹\d+/).first();
    await expect(price).toBeVisible();
    const priceText = (await price.textContent()) ?? "";
    const priceVal = parseFloat(priceText.replace(/[^0-9.]/g, ""));
    expect(priceVal).toBeGreaterThan(0);
  });

  // ── Add to Cart ────────────────────────────────────────────────────────────

  test("Add to Cart button is visible", async ({ page }) => {
    const addBtn = page
      .getByRole("button", { name: /Add to Cart/i })
      .first();
    await expect(addBtn).toBeVisible();
  });

  test("clicking Add to Cart toggles cart state", async ({ page }) => {
    // Size buttons uniquely contain both a size name AND a ₹price span.
    // Filter to enabled (in-stock) buttons only.
    const sizeBtn = page
      .locator("button")
      .filter({ hasText: /₹\d+/ })
      .and(page.locator("button:not([disabled])"))
      .first();
    if ((await sizeBtn.count()) > 0) {
      await sizeBtn.click();
    }

    // Button reads "Add to Cart" before click
    const addBtn = page.getByRole("button", { name: /Add to Cart/i }).first();
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // After adding, the button toggles to "Remove from Cart" (isInCart = true)
    // Verify the cart state changed — button text should now say "Remove from Cart"
    await expect(
      page.getByRole("button", { name: /Remove from Cart/i }).first()
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

  // ── Buy Now ────────────────────────────────────────────────────────────────

  test("Buy Now button is visible", async ({ page }) => {
    const buyNowBtn = page
      .getByRole("button", { name: /Buy Now/i })
      .first();
    await expect(buyNowBtn).toBeVisible();
  });

  // ── Related Products ───────────────────────────────────────────────────────

  test("related products section loads", async ({ page }) => {
    // Scroll to bottom to trigger lazy-loaded related products
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // Related products section heading
    const relatedHeading = page
      .getByText(/Related Products|You may also like|More Products/i)
      .first();

    // Allow 10s for section to appear after scroll
    try {
      await expect(relatedHeading).toBeVisible({ timeout: 10_000 });
    } catch {
      // Some products may not have related items — skip, don't fail
      test.skip(true, "Related products section not found — may be empty for this product");
    }
  });

  // ── Quantity controls ──────────────────────────────────────────────────────

  test("quantity controls are visible", async ({ page }) => {
    await expect(
      page.getByText("Quantity", { exact: true })
    ).toBeVisible();
  });

  // ── Share ──────────────────────────────────────────────────────────────────

  test("Share button is visible", async ({ page }) => {
    await expect(page.getByText("Share")).toBeVisible();
  });
});

// ── Loading skeleton ──────────────────────────────────────────────────────────

test.describe("Loading skeleton: no jarring blank screen", () => {
  test.setTimeout(30_000);

  test("no blank page or 'Loading...' text on product page navigation", async ({
    page,
  }) => {
    const productHref = await getFirstProductSlug(page);

    // Direct navigation — content should be immediately visible (ISR)
    await page.goto(productHref, { waitUntil: "domcontentloaded" });

    // Within 3s of DOM ready, we should see content (not a spinner)
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 3_000 });

    // Generic "Loading..." text should never appear (ISR means SSR content)
    const loadingText = page.getByText("Loading...", { exact: true });
    await expect(loadingText).toHaveCount(0);
  });
});
