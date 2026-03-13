import { test, expect, type Page } from "@playwright/test";

/**
 * Image Validation Tests
 *
 * Fetches all product slugs from the API, visits each product detail page,
 * and asserts that every image request returns 200 (no 400/404 errors).
 *
 * Specifically catches INVALID_IMAGE_OPTIMIZE_REQUEST (400) from the
 * Supabase render/transform API for missing image files.
 */

test.describe.configure({ mode: "serial" });

// ── Helpers ────────────────────────────────────────────────────────────────

/** Fetch the full list of product slugs from the local API (paginated). */
async function fetchAllProductSlugs(baseURL: string): Promise<string[]> {
  const limit = 100;
  const allProducts: Array<{ slug: string }> = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const res = await fetch(`${baseURL}/api/products?limit=${limit}&page=${page}`);
    if (!res.ok) throw new Error(`Products API returned ${res.status}`);
    const data = await res.json();
    let products: Array<{ slug: string }>;
    if (Array.isArray(data?.products)) products = data.products;
    else if (Array.isArray(data)) products = data;
    else products = [];
    if (products.length === 0) break;
    allProducts.push(...products);
    const pagination = data.pagination;
    hasNextPage = pagination?.hasNextPage === true;
    page += 1;
  }

  return allProducts.map((p) => p.slug).filter(Boolean);
}

/** Wait for the product detail page price to appear (signals data has loaded). */
async function waitForProductDetailToLoad(page: Page) {
  // Price may be formatted as ₹734 or ₹734.00 depending on the value
  await expect(page.getByText(/₹\d+/).first()).toBeVisible({
    timeout: 45_000,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────

test.describe("Product Image Validation", () => {
  test.setTimeout(300_000); // 5 min total for all products

  test("all product detail pages load images without 400/404 errors", async ({
    page,
    baseURL,
  }) => {
    const slugs = await fetchAllProductSlugs(baseURL ?? "http://localhost:3000");
    expect(slugs.length).toBeGreaterThan(0);
    console.log(`\nValidating images for ${slugs.length} products...`);

    const failures: Array<{
      slug: string;
      url: string;
      status: number;
    }> = [];

    for (const slug of slugs) {
      // Collect image responses for this page load
      const imageErrors: Array<{ url: string; status: number }> = [];

      const handleResponse = async (response: {
        url: () => string;
        status: () => number;
      }) => {
        const url = response.url();
        const status = response.status();
        // Only care about Supabase storage/render URLs
        if (
          url.includes("supabase.co/storage") &&
          (status === 400 || status === 404 || status === 500)
        ) {
          imageErrors.push({ url, status });
        }
      };

      page.on("response", handleResponse);

      try {
        await page.goto(`/products/${slug}`, { waitUntil: "domcontentloaded" });
        await waitForProductDetailToLoad(page);

        // Wait a moment for lazy-loaded thumbnails to fire their requests
        await page.waitForTimeout(1_500);

        if (imageErrors.length > 0) {
          for (const err of imageErrors) {
            failures.push({ slug, url: err.url, status: err.status });
            console.error(`  ✗ [${err.status}] ${slug} → ${err.url}`);
          }
        } else {
          console.log(`  ✓ ${slug}`);
        }
      } finally {
        page.off("response", handleResponse);
        imageErrors.length = 0;
      }
    }

    // Build failure report
    if (failures.length > 0) {
      const report = failures
        .map((f) => `  [${f.status}] ${f.slug}\n    ${f.url}`)
        .join("\n");
      throw new Error(
        `${failures.length} image request(s) returned errors:\n${report}`
      );
    }

    console.log(`\n✓ All ${slugs.length} products passed image validation.`);
  });

  test("all product images are visible on the page (no broken img tags)", async ({
    page,
    baseURL,
  }) => {
    const slugs = await fetchAllProductSlugs(baseURL ?? "http://localhost:3000");
    expect(slugs.length).toBeGreaterThan(0);
    console.log(`\nChecking visible images for ${slugs.length} products...`);

    const failures: Array<{ slug: string; issue: string }> = [];

    for (const slug of slugs) {
      try {
        await page.goto(`/products/${slug}`, { waitUntil: "domcontentloaded" });
        await waitForProductDetailToLoad(page);
        await page.waitForTimeout(1_000);

        // Check that at least one product image is visible (not broken)
        const images = page.locator('img[src*="supabase.co"]');
        const count = await images.count();

        if (count === 0) {
          // Fallback: any img on the page
          const anyImg = page.locator("img").first();
          const src = await anyImg.getAttribute("src");
          if (!src) {
            failures.push({ slug, issue: "No images found on page" });
            console.error(`  ✗ ${slug}: no images found`);
            continue;
          }
        }

        // Verify naturalWidth > 0 for all Supabase images (broken images have naturalWidth=0)
        const brokenImages = await page.evaluate(() => {
          const imgs = document.querySelectorAll('img');
          const broken: string[] = [];
          imgs.forEach((img) => {
            if (
              img.src &&
              img.src.includes("supabase.co") &&
              img.naturalWidth === 0 &&
              img.complete
            ) {
              broken.push(img.src);
            }
          });
          return broken;
        });

        if (brokenImages.length > 0) {
          for (const url of brokenImages) {
            failures.push({ slug, issue: `Broken image: ${url}` });
            console.error(`  ✗ ${slug}: broken image → ${url}`);
          }
        } else {
          console.log(`  ✓ ${slug} (${count} supabase image(s))`);
        }
      } catch (err) {
        failures.push({
          slug,
          issue: `Page failed to load: ${(err as Error).message}`,
        });
        console.error(`  ✗ ${slug}: ${(err as Error).message}`);
      }
    }

    if (failures.length > 0) {
      const report = failures
        .map((f) => `  ${f.slug}: ${f.issue}`)
        .join("\n");
      throw new Error(
        `${failures.length} product(s) have broken images:\n${report}`
      );
    }

    console.log(`\n✓ All ${slugs.length} products have valid visible images.`);
  });
});
