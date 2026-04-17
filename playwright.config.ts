import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// Load .env.local file if it exists
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry flaky tests locally (1) and on CI (2) */
  retries: process.env.CI ? 2 : 1,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  timeout: 60_000,
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /*
   * Projects: Chromium is the default for fast dev/CI; Firefox and WebKit run in a
   * separate CI job or via `npm run test:cross-browser` to catch browser-specific regressions.
   */
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },

    // Auth setup for payment tests — signs in the test user and saves session
    {
      name: 'payment-auth-setup',
      testMatch: /payment-auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Payment tests — run after auth setup, reuse the saved session
    {
      name: 'payment',
      testMatch: /payment\.spec\.ts/,
      dependencies: ['payment-auth-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/payment-user.json',
        video: 'on',
      },
    },

    // Auth setup for purchase flow — logs in once and saves session
    {
      name: 'purchase-auth-setup',
      testMatch: /purchase-auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Mobile purchase flow — Chromium with 375x812 mobile viewport.
    // Depends on purchase-auth-setup so login is pre-authenticated (no repeated
    // Supabase logins). Retries disabled — test is stateful (clears cart, deletes
    // addresses, creates order) so retries don't add value and complicate debugging.
    // Note: intentionally NOT using devices['iPhone SE'] (WebKit) — the app has
    // separate WebKit CORS issues (406s, JWT failures) unrelated to purchase flow.
    {
      name: 'mobile-purchase',
      testMatch: /e2e-purchase-flow\.spec\.ts/,
      retries: 0,
      dependencies: ['purchase-auth-setup'],
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 375, height: 812 },
        storageState: 'tests/.auth/purchase-user.json',
        video: 'on',
      },
    },

    // Admin impersonation happy-path — reuses the same logged-in session
    // from purchase-auth-setup (TEST_ADMIN_EMAIL is already an admin in the
    // project; role is checked via Supabase JWT, not hard-coded here).
    // Desktop viewport: the admin block on ProfileForm renders identically
    // on mobile, but desktop avoids the drawer/sheet edge cases and gives
    // the amber override panel more room.
    // Retries disabled — the test creates a brand-new Supabase auth user
    // and places a real order; retries would leak duplicate records and
    // hide root causes.
    {
      name: 'admin-impersonation',
      testMatch: /admin-impersonation\.spec\.ts/,
      retries: 0,
      dependencies: ['purchase-auth-setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        storageState: 'tests/.auth/purchase-user.json',
        video: 'on',
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
