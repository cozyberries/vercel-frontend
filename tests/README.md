# Playwright Tests

This directory contains end-to-end tests for the application using Playwright.

## Test Files

- `auth.spec.ts` - Tests for authentication flows (signup, sign in, sign out)
- `helpers/auth-helpers.ts` - Reusable helper functions for authentication tests

## Running Tests

### Run all tests
```bash
npx playwright test
```

### Run specific test file
```bash
npx playwright test auth.spec.ts
```

### Run tests in headed mode (see browser)
```bash
npx playwright test --headed
```

### Run tests in debug mode
```bash
npx playwright test --debug
```

### Run tests for specific browser
```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

## Environment Variables

For tests that require existing user credentials, you can set the following environment variables:

```bash
TEST_USER_EMAIL=your-test-email@example.com
TEST_USER_PASSWORD=your-test-password
```

These are used in sign-in tests that require a pre-existing user account.

## Test Coverage

### Authentication Tests (`auth.spec.ts`)

#### Signup Tests
- ✅ Successful signup with valid credentials
- ✅ Error handling for password mismatch
- ✅ Error handling for existing email
- ✅ Form validation for required fields
- ✅ Navigation between signup and login pages

#### Sign In Tests
- ✅ Successful sign in with valid credentials
- ✅ Error handling for invalid credentials
- ✅ Form validation for required fields
- ✅ Navigation between login and signup pages
- ✅ Loading state verification

#### Sign Out Tests
- ✅ Successful sign out from profile page
- ✅ Redirect to login when accessing protected pages after sign out

#### Integration Tests
- ✅ Complete flow: signup → sign in → sign out

## Test Helpers

The `helpers/auth-helpers.ts` file provides reusable functions:

- `generateTestEmail()` - Generates unique test email addresses
- `generateTestPassword()` - Generates test passwords
- `signUp(page, email, password, confirmPassword?)` - Helper to sign up a user
- `signIn(page, email, password)` - Helper to sign in a user
- `signOut(page)` - Helper to sign out a user
- `waitForSignIn(page)` - Waits for successful sign in
- `getTestCredentials()` - Gets test credentials from environment variables

## Viewing Test Results

After running tests, you can view the HTML report:

```bash
npx playwright show-report
```

## Configuration

Test configuration is in `playwright.config.ts` at the root of the project. The configuration includes:

- Test directory: `./tests`
- Web server: Automatically starts `npm run dev` on `http://localhost:3000`
- Browsers: Chromium, Firefox, and WebKit
- Retries: 2 retries in CI, 0 locally

## Notes

- The dev server must be running or will be started automatically by Playwright
- Some tests may require email confirmation depending on your Supabase configuration
- Tests use unique email addresses to avoid conflicts
- Make sure your test environment has the necessary Supabase configuration

