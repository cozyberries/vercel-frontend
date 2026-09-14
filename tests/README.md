# Playwright Test Suite

This directory contains end-to-end tests for the application using Playwright.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install
```

## Running Tests

### Run all tests
```bash
npm run test
```

### Run authentication tests only
```bash
npm run test:auth
```

### Run tests in UI mode (interactive)
```bash
npm run test:ui
```

### Run tests in headed mode (see browser)
```bash
npm run test:headed
```

### View test report
```bash
npm run test:report
```

## Test Files

### `auth.spec.ts`
Tests for the phone-first auth UI (`/login`, `/signup`, `/login/email` staff sign-in,
`/login/verify` redirect guard) including:
- Rendering and client-side mobile-number validation on `/login` and `/signup`
- Staff (email + password) sign-in error handling, HTML5 validation, and loading state
- Navigation between `/login`, `/signup`, and `/login/email`
- "Continue as guest" and the `redirect` query param

Phone sign-in sends a real OTP SMS, so these tests never submit a valid-looking
mobile number and never attempt a real login. Email/password *signup* was
removed from the product (only `/login/email` staff sign-in remains); do not
re-add those tests without confirming the feature exists again.

## Configuration

Tests are configured in `playwright.config.ts`. The default base URL is `http://localhost:3000`.

You can override the base URL using environment variables:
```bash
PLAYWRIGHT_TEST_BASE_URL=http://localhost:3000 npm run test
```

## Test Credentials

The tests use dynamically generated email addresses to avoid conflicts:
- Format: `test-{timestamp}@example.com`
- Password: `TestPassword123!`

**Note**: For tests that require actual authentication (like successful login), you'll need to:
1. Create a test user in your Supabase project
2. Update the test with valid credentials
3. Or configure Supabase to auto-confirm emails for testing

## Environment Variables

Make sure you have the following environment variables set in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (for admin operations)

## CI/CD Integration

The tests are configured to:
- Run in parallel on CI
- Retry failed tests twice
- Generate HTML reports
- Take screenshots on failure

## Debugging

To debug a test:
1. Run in UI mode: `npm run test:ui`
2. Use `await page.pause()` in your test code
3. Use Playwright Inspector: `PWDEBUG=1 npm run test`

## Writing New Tests

1. Create a new `.spec.ts` file in the `tests/` directory
2. Import test utilities from `@playwright/test`
3. Use descriptive test names
4. Group related tests with `test.describe()`

Example:
```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('should do something', async ({ page }) => {
    await page.goto('/');
    // Your test code here
  });
});
```





## Conventions (2026-09)

- Every bug found or reported gets an automated test: a vitest unit test when the defect is in a
  pure module, a Playwright spec when it is in a page, a route header, a redirect or browser
  behaviour (console errors, caching). Verification of fixes and deploys runs through scripts,
  never by hand.
- `tests/catalog.spec.ts` covers the Redis catalog: snapshot + health agreement, search ranking,
  the /products grid (instant filtering, URL sync, infinite scroll), static rendering of / and
  product pages, console hygiene. `tests/pages-coverage.spec.ts` covers pages that had no spec and
  sweeps every public page for console errors and 5xx responses. Both run at 375x812.
- Component tests live next to their component as `*.test.tsx` with a
  `// @vitest-environment jsdom` docblock (see `app/products/ProductsClient.test.tsx`).
- Run the browser suites against a production build (`npm run build && npx next start -p 3000`);
  `next dev` shares `.next` with the build and must not run at the same time.
