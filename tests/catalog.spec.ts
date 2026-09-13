import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Catalog cache end-to-end coverage: the Redis-served snapshot, search ranking, the /products
 * grid (instant local filtering, URL sync, infinite scroll), static rendering of the home and
 * product pages, and console hygiene on those pages.
 *
 * Mobile-first: every browser test here runs at 375x812.
 */
test.use({ viewport: { width: 375, height: 812 } });

type Snapshot = {
  version: string;
  products: Array<{ slug: string; name: string; category_slug: string }>;
  reference: { categories: Array<{ slug: string; name: string }> };
};

async function loadSnapshot(request: APIRequestContext): Promise<Snapshot> {
  const response = await request.get("/api/catalog");
  expect(response.status()).toBe(200);
  return (await response.json()) as Snapshot;
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** A word from a product name that the search should find (letters only, 4+ chars). */
function searchTermFrom(snapshot: Snapshot): string {
  for (const product of snapshot.products) {
    const word = product.name.split(/\s+/).find((w) => /^[A-Za-z]{4,}$/.test(w));
    if (word) return word.toLowerCase();
  }
  throw new Error("no product name contains a searchable word");
}

async function uniqueCardCount(page: Page): Promise<number> {
  return page.evaluate(
    () => new Set([...document.querySelectorAll('a[href^="/products/"]')].map((a) => a.getAttribute("href"))).size,
  );
}

async function visibleItemsCount(page: Page): Promise<number> {
  const text = await page.getByText(/^\d+ items?$/).first().textContent();
  return Number.parseInt(text ?? "NaN", 10);
}

test.describe("Catalog API", () => {
  test("/api/catalog serves a versioned snapshot with an ETag and agrees with /api/health/catalog", async ({
    request,
  }) => {
    const response = await request.get("/api/catalog");
    expect(response.status()).toBe(200);
    const snapshot = (await response.json()) as Snapshot;
    expect(snapshot.products.length).toBeGreaterThan(0);
    expect(snapshot.reference.categories.length).toBeGreaterThan(0);
    expect(response.headers()["x-catalog-version"]).toBe(snapshot.version);
    expect(response.headers()["etag"]).toContain(snapshot.version);

    const health = await request.get("/api/health/catalog");
    expect(health.status(), await health.text()).toBe(200);
    const body = await health.json();
    expect(body.ok).toBe(true);
    expect(body.version).toBe(snapshot.version);
    expect(body.productCount).toBe(snapshot.products.length);
    // A missing or half-built Redis Search index shows up here as a count mismatch or null.
    expect(body.indexDocCount).toBe(snapshot.products.length);
  });

  test("the snapshot is served from Redis, not the Supabase fallback", async ({ request }) => {
    await request.get("/api/catalog");
    const second = await request.get("/api/catalog");
    expect(second.headers()["x-cache-status"]).toBe("HIT");
  });

  test("/api/search ranks products for a real word and returns the snapshot version", async ({ request }) => {
    const snapshot = await loadSnapshot(request);
    const term = searchTermFrom(snapshot);
    const response = await request.get(`/api/search?q=${encodeURIComponent(term)}`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.version).toBe(snapshot.version);
    // null means the Redis Search index is missing and the client fell back to substring matching.
    expect(Array.isArray(body.slugs), "ranking unavailable: is the cozyberries-search index present?").toBe(true);
    expect(body.slugs.length).toBeGreaterThan(0);
  });

  test("compatibility routes answer from the catalog with its version header", async ({ request }) => {
    for (const path of ["/api/products?limit=12", "/api/categories", "/api/ages/options", "/api/search/suggestions?q=fro"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect(response.headers()["x-catalog-version"], `${path} is not served from the catalog`).toBeTruthy();
    }
  });
});

test.describe("Products page", () => {
  test("renders the whole catalog with instant filtering, search and infinite scroll", async ({ page, request }) => {
    const snapshot = await loadSnapshot(request);
    const total = snapshot.products.length;
    const errors = collectConsoleErrors(page);

    await page.goto("/products");
    await expect(page.getByText(`${total} items`)).toBeVisible({ timeout: 15_000 });
    expect(await uniqueCardCount(page)).toBe(Math.min(12, total));

    // Category chip: soft URL update, no navigation, count follows the filter.
    const category = snapshot.reference.categories.find((c) => snapshot.products.some((p) => p.category_slug === c.slug));
    expect(category, "no category has products").toBeTruthy();
    const expected = snapshot.products.filter((p) => p.category_slug === category!.slug).length;
    await page.getByRole("button", { name: category!.name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]category=${category!.slug}(&|$)`));
    await expect(page.getByText(`${expected} items`)).toBeVisible();
    expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(1);

    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(page).not.toHaveURL(/category=/);
    await expect(page.getByText(`${total} items`)).toBeVisible();

    // Search: the URL carries the term, one ranking request fires, and matches come back.
    const term = searchTermFrom(snapshot);
    const searchBox = page.getByRole("textbox", { name: /search/i });
    const rankingRequest = page.waitForRequest((r) => r.url().includes("/api/search?"));
    await searchBox.fill(term);
    await rankingRequest;
    await expect(page).toHaveURL(new RegExp(`[?&]search=${encodeURIComponent(term)}`));
    await expect.poll(() => visibleItemsCount(page)).toBeGreaterThan(0);

    await searchBox.fill("");
    await expect(page).not.toHaveURL(/search=/);
    await expect(page.getByText(`${total} items`)).toBeVisible();

    // Infinite scroll: every product becomes visible, all from the local snapshot.
    for (let round = 0; round < 10 && (await uniqueCardCount(page)) < total; round++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(400);
    }
    expect(await uniqueCardCount(page)).toBe(total);

    expect(errors).toEqual([]);
  });

  test("a direct link with filters renders the filtered grid server-side", async ({ page, request }) => {
    const snapshot = await loadSnapshot(request);
    const category = snapshot.reference.categories.find((c) => snapshot.products.some((p) => p.category_slug === c.slug))!;
    const expected = snapshot.products.filter((p) => p.category_slug === category.slug).length;
    await page.goto(`/products?category=${category.slug}`);
    await expect(page.getByText(`${expected} items`)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Static rendering", () => {
  test("home and product pages are served static, never through no-store", async ({ request }) => {
    const snapshot = await loadSnapshot(request);
    for (const path of ["/", `/products/${snapshot.products[0].slug}`]) {
      await request.get(path);
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      const headers = response.headers();
      if (headers["x-vercel-id"]) {
        // On Vercel the CDN consumes s-maxage; the cache status header is the evidence.
        expect(["HIT", "STALE", "PRERENDER"], `${path} x-vercel-cache=${headers["x-vercel-cache"]}`).toContain(
          headers["x-vercel-cache"],
        );
      } else {
        expect(headers["cache-control"], path).toContain("s-maxage");
        expect(headers["cache-control"], path).not.toContain("no-store");
      }
    }
  });

  test("the product page renders from the catalog without console errors", async ({ page, request }) => {
    const snapshot = await loadSnapshot(request);
    const product = snapshot.products[0];
    const errors = collectConsoleErrors(page);
    await page.goto(`/products/${product.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(product.name, { timeout: 15_000 });
    await expect(page.getByRole("button", { name: /add to cart/i }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
