import { test as setup, expect } from "@playwright/test";

const TEST_EMAIL = "playwright-test@cozyberries.com";
const TEST_PASSWORD = "TestPassword123";
const AUTH_STATE_FILE = "tests/.auth/payment-user.json";

/**
 * Auth setup: sign in as the test user and save the session state.
 * This runs before the payment tests so they have a valid session.
 */
setup("authenticate test user", async ({ page }) => {
  await page.goto("/login");

  // Fill in credentials
  await page.getByLabel(/Email address/i).fill(TEST_EMAIL);
  await page.getByLabel(/^Password$/i).fill(TEST_PASSWORD);

  // Click sign in
  await page.getByRole("button", { name: /Sign in/i }).click();

  // Wait for either redirect to home page or dashboard
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

  // Save the auth state (cookies + localStorage)
  await page.context().storageState({ path: AUTH_STATE_FILE });
});
