/**
 * Playwright verification script for the performance optimisation changes.
 * Run: npx ts-node scripts/verify-optimisations.ts
 */
import { chromium, devices, type Page, type Browser } from "@playwright/test";

const BASE_URL = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";

interface Metric {
  label: string;
  pass: boolean;
  value?: string | number;
  detail?: string;
}

const results: Metric[] = [];

function report(label: string, pass: boolean, value?: string | number, detail?: string) {
  results.push({ label, pass, value, detail });
  const icon = pass ? "✅" : "❌";
  const extra = value !== undefined ? ` (${value})` : "";
  const det = detail ? ` — ${detail}` : "";
  console.log(`  ${icon} ${label}${extra}${det}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function measurePageLoad(page: Page, url: string) {
  const start = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const domReady = Date.now() - start;

  // Use "load" rather than "networkidle" — the app keeps polling APIs so networkidle can timeout
  await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
  const fullLoad = Date.now() - start;

  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const lcp = performance.getEntriesByType("largest-contentful-paint").slice(-1)[0] as PerformanceEntry | undefined;
    const fcp = performance.getEntriesByType("paint").find((e) => e.name === "first-contentful-paint");
    return {
      ttfb: Math.round(nav.responseStart - nav.requestStart),
      domInteractive: Math.round(nav.domInteractive - nav.requestStart),
      transferSize: nav.transferSize,
      lcp: lcp ? Math.round(lcp.startTime) : null,
      fcp: fcp ? Math.round(fcp.startTime) : null,
    };
  });

  return { domReady, fullLoad, ...metrics };
}

// ─── Test Suites ──────────────────────────────────────────────────────────────

async function testViewportMeta(page: Page) {
  console.log("\n📐 Viewport & Layout");
  await page.goto(BASE_URL);

  const viewportMeta = await page.$eval(
    'meta[name="viewport"]',
    (el) => el.getAttribute("content"),
  ).catch(() => null);
  report("viewport meta tag present", !!viewportMeta, viewportMeta ?? "missing");

  const hasViewportWidth = viewportMeta?.includes("width=device-width") ?? false;
  report("viewport includes width=device-width", hasViewportWidth);

  // Check page doesn't overflow horizontally
  const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
  report("no horizontal overflow on homepage", !overflow, `scrollWidth=${await page.evaluate(() => document.body.scrollWidth)}`);
}

async function testImageOptimisation(page: Page) {
  console.log("\n🖼️  Image Optimisation");
  await page.goto(BASE_URL);

  // Check next.config has optimisation enabled (no unoptimized flag) by verifying
  // that /_next/image endpoint is used for product images
  await page.waitForSelector("img", { timeout: 5000 }).catch(() => {});

  const imgSources = await page.$$eval("img[src]", (imgs) =>
    imgs.map((img) => ({
      src: img.getAttribute("src") ?? "",
      // Exclude tiny decorative images (w-16, SVG containers) — only flag large product/category images
      isLarge: (img as HTMLImageElement).naturalWidth > 100 || img.className.includes("object-cover"),
    })),
  );

  const nextImageCount = imgSources.filter((i) => i.src.startsWith("/_next/image")).length;
  // Only flag images where src has a direct Cloudinary URL without going through _next/image.
  // URLs may be absolute (http://localhost:3000/_next/image?url=...) or relative (/_next/image?url=...),
  // so we check for the _next/image path segment rather than using startsWith.
  const cloudinaryDirect = imgSources.filter(
    (i) =>
      i.src.includes("res.cloudinary.com") &&
      !i.src.includes("_next/image") &&
      !i.src.endsWith(".svg"),
  ).length;

  report(
    "Next.js /_next/image optimizer used for images",
    nextImageCount > 0,
    `${nextImageCount} optimised`,
  );
  report(
    "No unoptimised non-SVG Cloudinary images",
    cloudinaryDirect === 0,
    cloudinaryDirect > 0 ? `${cloudinaryDirect} direct (non-SVG)` : "all proxied",
  );

  // Check sizes attribute on images
  const withSizes = await page.$$eval("img[sizes]", (imgs) => imgs.length);
  report("Images have sizes attribute", withSizes > 0, `${withSizes} images`);
}

async function testSheetWidths(page: Page) {
  console.log("\n📏 Sheet / Drawer Widths (320px viewport)");
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(BASE_URL);
  await page.waitForTimeout(1000);

  // Cart button has sr-only text "Cart" inside it
  const cartBtn = await page.$('button:has(.sr-only)') ??
    await page.$('button[aria-label="Cart"]') ??
    await page.$('button:has([class*="shopping"])');
  // Fallback: find button containing ShoppingBag icon (Lucide renders as svg)
  const cartTrigger = cartBtn ?? await page.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons.find(b => b.querySelector("svg") && b.textContent?.includes("Cart")) ?? null;
  }).then(h => h.asElement());

  if (cartTrigger) {
    await cartTrigger.click();
    await page.waitForTimeout(400);

    const sheetWidth = await page.evaluate(() => {
      const sheet = document.querySelector('[role="dialog"]') as HTMLElement | null;
      return sheet?.offsetWidth ?? 0;
    });
    const viewportWidth = 320;
    report(
      "Cart sheet does not overflow 320px viewport",
      sheetWidth <= viewportWidth,
      `${sheetWidth}px ≤ ${viewportWidth}px`,
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  } else {
    report("Cart sheet found & width within viewport", false, "button not found — check selector");
  }

  await page.setViewportSize({ width: 390, height: 844 });
}

async function testProductCardNavigation(page: Page) {
  console.log("\n🔗 Product Card Navigation");
  await page.goto(`${BASE_URL}/products`);
  await page.waitForSelector('[data-testid="infinite-scroll-sentinel"], .grid', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // Click a product card and verify soft navigation (no full page request)
  const productCard = await page.$(".grid a[href*='/products/']");
  if (productCard) {
    // Track full-page HTML requests — soft nav only fetches JSON/RSC payloads, not text/html
    const fullPageRequests: string[] = [];
    const onResponse = (res: import("@playwright/test").Response) => {
      const ct = res.headers()["content-type"] ?? "";
      if (ct.includes("text/html") && res.status() === 200) {
        fullPageRequests.push(res.url());
      }
    };
    page.on("response", onResponse);

    const navPromise = page.waitForURL(/\/products\/.+/, { timeout: 5000 });
    await productCard.click();
    await navPromise.catch(() => {});
    page.off("response", onResponse);
    await page.waitForTimeout(500);

    const currentUrl = page.url();
    report(
      "Product card navigates to product detail",
      currentUrl.includes("/products/") && currentUrl !== `${BASE_URL}/products`,
      currentUrl,
    );
    // Soft nav: no text/html document reload; Next.js RSC uses application/json or text/x-component
    report(
      "Navigation is client-side (no full HTML document reload)",
      fullPageRequests.length === 0,
      fullPageRequests.length === 0 ? "soft nav confirmed" : `${fullPageRequests.length} full-page requests`,
    );
  } else {
    report("Product card links found", false, "no product cards visible");
    report("Navigation is client-side (no full HTML document reload)", false, "skipped — no cards");
  }
}

async function testSkeletonLoader(page: Page) {
  console.log("\n💀 Skeleton Loaders");

  // Throttle network to catch skeleton before products load
  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    downloadThroughput: (150 * 1024) / 8,
    uploadThroughput: (150 * 1024) / 8,
    latency: 200,
  });

  await page.goto(`${BASE_URL}/products`, { waitUntil: "domcontentloaded" });

  // Check for skeleton elements (animate-pulse divs) before data loads
  const skeletonCount = await page.$$eval(".animate-pulse", (els) => els.length);
  report("Skeleton loaders shown during loading", skeletonCount > 0, `${skeletonCount} pulse elements`);

  // Restore normal network
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    downloadThroughput: -1,
    uploadThroughput: -1,
    latency: 0,
  });
}

async function testMobileLayout(page: Page) {
  console.log("\n📱 Mobile Layout (390px)");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

  // Check mobile bottom nav is visible
  const mobileNav = await page.$(".fixed.bottom-0");
  report("Mobile bottom nav rendered", !!mobileNav);

  // Check header logo doesn't cause horizontal overflow
  const bodyOverflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
  report("No horizontal overflow on mobile homepage", !bodyOverflow);

  // Check product detail page mobile CTA doesn't cover bottom nav
  await page.goto(`${BASE_URL}/products`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("a[href*='/products/']", { timeout: 8000 }).catch(() => {});

  const firstProduct = await page.$("a[href*='/products/']");
  if (firstProduct) {
    const href = await firstProduct.getAttribute("href");
    if (href) {
      await page.goto(`${BASE_URL}${href}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1000);

      // Check mobile CTA is at bottom-16 (above the bottom nav)
      const ctaBottom = await page.evaluate(() => {
        const cta = document.querySelector(".fixed.bottom-16.md\\:hidden") as HTMLElement | null;
        return cta ? "present at bottom-16" : null;
      });
      report(
        "Product detail CTA sits above mobile bottom nav (bottom-16)",
        !!ctaBottom,
        ctaBottom ?? "not found or wrong position",
      );
    }
  }
}

async function testPageLoadTimes(browser: Browser) {
  console.log("\n⚡ Page Load Times");

  const testPages = [
    { name: "Homepage", url: BASE_URL },
    { name: "Products page", url: `${BASE_URL}/products` },
  ];

  for (const { name, url } of testPages) {
    // Desktop
    const desktopPage = await browser.newPage();
    await desktopPage.setViewportSize({ width: 1280, height: 800 });
    const desktopMetrics = await measurePageLoad(desktopPage, url);
    await desktopPage.close();

    // Mobile (iPhone 13)
    const mobilePage = await browser.newPage({ ...devices["iPhone 13"] });
    const mobileMetrics = await measurePageLoad(mobilePage, url);
    await mobilePage.close();

    console.log(`\n  ${name}:`);
    console.log(`    Desktop — TTFB: ${desktopMetrics.ttfb}ms | FCP: ${desktopMetrics.fcp ?? "n/a"}ms | LCP: ${desktopMetrics.lcp ?? "n/a"}ms | DOM interactive: ${desktopMetrics.domInteractive}ms | Full load: ${desktopMetrics.fullLoad}ms`);
    console.log(`    Mobile  — TTFB: ${mobileMetrics.ttfb}ms | FCP: ${mobileMetrics.fcp ?? "n/a"}ms | LCP: ${mobileMetrics.lcp ?? "n/a"}ms | DOM interactive: ${mobileMetrics.domInteractive}ms | Full load: ${mobileMetrics.fullLoad}ms`);

    report(`${name} desktop FCP < 3s`, (desktopMetrics.fcp ?? 9999) < 3000, `${desktopMetrics.fcp ?? "n/a"}ms`);
    report(`${name} mobile FCP < 3s`, (mobileMetrics.fcp ?? 9999) < 3000, `${mobileMetrics.fcp ?? "n/a"}ms`);
    report(`${name} TTFB < 800ms`, desktopMetrics.ttfb < 800, `${desktopMetrics.ttfb}ms`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Cozyberries Performance Optimisation Verification\n");
  console.log(`   Target: ${BASE_URL}`);
  console.log("   ─────────────────────────────────────────────────");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();

  try {
    await testViewportMeta(page);
    await testImageOptimisation(page);
    await testSheetWidths(page);
    await testProductCardNavigation(page);
    await testSkeletonLoader(page);
    await testMobileLayout(page);
    await testPageLoadTimes(browser);
  } catch (err) {
    console.error("\n  💥 Unexpected error:", err);
  } finally {
    await browser.close();
  }

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  console.log("\n─────────────────────────────────────────────────");
  console.log(`  Results: ${passed} passed / ${failed} failed`);
  if (failed > 0) {
    console.log("\n  Failed checks:");
    results.filter((r) => !r.pass).forEach((r) => {
      console.log(`    ❌ ${r.label}${r.value !== undefined ? ` (${r.value})` : ""}${r.detail ? ` — ${r.detail}` : ""}`);
    });
  }
  console.log("─────────────────────────────────────────────────\n");

  process.exit(failed > 0 ? 1 : 0);
}

main();
