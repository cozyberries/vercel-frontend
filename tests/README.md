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
Comprehensive tests for user authentication including:
- Signup flow validation
- Login flow validation
- Form validation
- Error handling
- Navigation between pages

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




