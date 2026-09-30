import { test, expect } from "@playwright/test";

const HAS_ADMIN = Boolean(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

test.describe("admin shell (phone)", () => {
  test.skip(!HAS_ADMIN, "TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD not set");

  test("walks every tab in the shell", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("navigation", { name: "Admin sections" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Quick access" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    // No storefront chrome under /admin.
    await expect(page.getByLabel("Go to cart")).toHaveCount(0);

    const tabs: [string, string][] = [
      ["Orders", "Orders"],
      ["Pickups", "Stall pickups"],
      ["Refills", "Stall refills"],
      ["On-behalf", "On-behalf orders"],
      ["Impersonate", "Impersonate user"],
    ];
    for (const [tab, heading] of tabs) {
      await page.getByRole("navigation", { name: "Admin sections" }).getByRole("link", { name: tab }).click();
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Admin sections" }).getByRole("link", { name: tab })).toHaveAttribute("aria-current", "page");
    }
    // Bottom bar reaches Orders in one tap.
    await page.getByRole("navigation", { name: "Quick access" }).getByRole("link", { name: "Orders" }).click();
    await expect(page).toHaveURL(/\/admin\/orders$/);
    // No horizontal page scroll at phone width.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("dashboard tiles open the matching pickup tab", async ({ page }) => {
    // A client-side link click renders the page before the router updates the
    // URL, so the tab must be read after mount, not during the first render.
    const tiles: [RegExp, RegExp][] = [
      [/^Ready for pickup/, /^Ready$/],
      [/^Awaiting ✅/, /^Awaiting ✅/],
      [/^Collected today/, /^Collected today/],
    ];
    for (const [tile, tab] of tiles) {
      await page.goto("/admin");
      await page.getByRole("link", { name: tile }).click();
      await expect(page).toHaveURL(/\/admin\/pickup-orders\?tab=/);
      await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
    }
  });

  test("storefront shows one Admin entry", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByRole("link", { name: "Open admin" })).toHaveAttribute("href", "/admin");
    await expect(page.getByText("Stall refills")).toHaveCount(0);
  });

  test("a signed-out visitor is sent to login", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto("/admin/orders");
    await expect(page).toHaveURL(/\/login\?redirect=/);
    await ctx.close();
  });
});
