import { test as setup, expect } from "@playwright/test";

const EMAIL = process.env.TEST_ADMIN_EMAIL ?? "";
const PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? "";
const AUTH_STATE_FILE = "tests/.auth/purchase-user.json";

if (!EMAIL || !PASSWORD) {
  throw new Error(
    "TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD must be set in .env.local"
  );
}

/**
 * Auth setup: sign in once and save the session state.
 * The mobile-purchase project reuses this session so the main test
 * never needs to log in (avoiding Supabase rate limits on repeated logins).
 */
setup("authenticate purchase test user", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" });

  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });

  await page.context().storageState({ path: AUTH_STATE_FILE });
});
