# Playwright E2E Tests

This directory contains end-to-end tests for the application using Playwright.

## Setup

1. Install dependencies (if not already installed):
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install
```

3. Set up environment variables in `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PLAYWRIGHT_TEST_BASE_URL=http://localhost:3000
```

## Running Tests

### Run all tests
```bash
npm run test:e2e
```

### Run tests in UI mode (interactive)
```bash
npm run test:e2e:ui
```

### Run tests in headed mode (see browser)
```bash
npm run test:e2e:headed
```

### Run specific test file
```bash
npx playwright test tests/auth.spec.ts
```

## Test Structure

### Authentication Tests (`auth.spec.ts`)

Tests cover the complete authentication flow:

1. **User Signup Flow**
   - Valid registration
   - Password mismatch validation
   - Invalid email format
   - Duplicate email registration
   - Password requirements validation

2. **User Signin Flow**
   - Successful login
   - Wrong password handling
   - Non-existent user handling
   - Email format validation

3. **User Signout Flow**
   - Successful logout
   - Protected route access after logout
   - Session cleanup

4. **Edge Cases**
   - Network error handling
   - Session persistence after page reload

## Test Data

Tests use dynamically generated email addresses with the prefix `test_playwright_` to avoid conflicts. Test users are automatically cleaned up after each test.

## Page Object Model

Tests use the Page Object Model pattern for better maintainability:

- `RegisterPage` - Handles registration form interactions
- `LoginPage` - Handles login form interactions
- `ProfilePage` - Handles profile page interactions
- `Header` - Handles navigation and user menu interactions

## Notes

- Tests require the development server to be running (automatically started by Playwright)
- Tests clean up test users from Supabase after execution
- Some tests may require email confirmation to be disabled in Supabase for full functionality
- Tests use environment variables for Supabase credentials

