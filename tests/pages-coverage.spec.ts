import { test, expect, type Page } from "@playwright/test";

/**
 * Pages that had no end-to-end coverage, plus a console-hygiene sweep of every public page.
 * Mobile-first: runs at 375x812.
 */
test.use({ viewport: { width: 375, height: 812 } });

const PLACEHOLDER_UUID = "00000000-0000-0000-0000-000000000000";

function watch(page: Page): { consoleErrors: string[]; serverErrors: string[] } {
  const consoleErrors: string[] = [];
  const serverErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
  });
  return { consoleErrors, serverErrors };
}

test.describe("Previously uncovered pages", () => {
  test("/offers renders", async ({ page }) => {
    const watched = watch(page);
    await page.goto("/offers");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });
    expect(watched.consoleErrors).toEqual([]);
    expect(watched.serverErrors).toEqual([]);
  });

  test("/offline renders the offline fallback", async ({ page }) => {
    const watched = watch(page);
    await page.goto("/offline");
    await expect(page.getByText(/offline/i).first()).toBeVisible({ timeout: 15_000 });
    expect(watched.consoleErrors).toEqual([]);
  });

  test("/login/verify without a pending login returns to /login", async ({ page }) => {
    await page.goto("/login/verify");
    await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 15_000 });
  });

  for (const path of [`/orders/${PLACEHOLDER_UUID}/invoice`, "/profile/account-details", "/profile/addresses"]) {
    test(`${path} requires login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    });
  }
});

test.describe("Console hygiene on public pages", () => {
  const publicPages = [
    "/",
    "/products",
    "/about",
    "/contact",
    "/cart",
    "/wishlist",
    "/offers",
    "/login",
    "/login/email",
    "/signup",
    "/notifications",
    "/orders",
    "/offline",
  ];

  for (const path of publicPages) {
    test(`${path} loads with no console errors and no 5xx responses`, async ({ page }) => {
      const watched = watch(page);
      const response = await page.goto(path);
      expect(response?.status(), `${path} status`).toBeLessThan(400);
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
      await page.waitForTimeout(500);
      expect(watched.consoleErrors, `${path} console errors`).toEqual([]);
      expect(watched.serverErrors, `${path} server errors`).toEqual([]);
    });
  }
});
