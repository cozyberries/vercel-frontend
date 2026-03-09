# E2E Purchase Flow Test Design

**Date**: 2026-03-09
**Scope**: Full purchase flow E2E test in mobile viewport

## Goal

A single Playwright test that validates the entire purchase funnel with no mocks. All steps must pass for the test to pass.

## File Changes

- `tests/e2e-purchase-flow.spec.ts` — replace existing draft
- `playwright.config.ts` — add `mobile-purchase` project (375×812)

## Viewport

375×812 (mobile-first, matches primary user device)

## Env Vars

```
TEST_ADMIN_EMAIL=...
TEST_ADMIN_PASSWORD=...
```

Both must be present in `.env.local`.

## Test Flow

### 1. Login
- Navigate to `/login`
- Fill `#email` and `#password` fields
- Click "Sign in" button
- Wait for redirect to `/profile`
- **Timeout**: 15s

### 2. Clear Client State
- Use `page.evaluate()` to remove cart and wishlist localStorage keys
- Do NOT use `localStorage.clear()` — it would wipe Supabase auth session
- **Timeout**: N/A (synchronous)

### 3. Delete Existing Addresses
- Navigate to `/profile`
- Find all address delete buttons and click them one by one
- Wait for each to disappear before proceeding
- Skip gracefully if no addresses exist
- **Timeout**: 8s per delete

### 4. Add Product to Cart
- Navigate to `/products`
- Wait for first product link (`a[href*="/products/"]`)
- Click product → wait for product page to load
- Select first available (non-disabled) size button if present
- Click "Add to Cart" button
- Wait 1.5s for cart state to persist to localStorage
- **Timeout**: 10s per step

### 5. Checkout — Create Address
- Navigate to `/checkout`
- Assert cart is not empty (no "Your cart is empty" text)
- Click "Add New Address" button
- Fill address form with:
  - Full name: `Test User`
  - Phone: `9876543210`
  - Address line 1: `12 MG Road`
  - City: `Bengaluru`
  - State: `Karnataka`
  - Pincode: `560001`
  - Country: `India`
- Click Save
- Wait for "Delivery available to" text (pincode serviceability confirmed)
- **Timeout**: 15s for pincode check

### 6. Submit Order
- Wait for "Pay ₹{amount}" button to be enabled
- Click it
- **Timeout**: 5s

### 7. Payment Page
- Wait for URL to match `/payment/session/`
- Click "I Have Paid" button
- Wait for confirm prompt to appear
- Click "Yes, I have paid"
- **Timeout**: 15s

### 8. Assert Success
- Expect "Order Placed!" to be visible
- Expect "We are verifying your payment" to be visible
- **Timeout**: 10s

### 9. Assert No Browser Errors
- Console errors and page errors collected throughout
- Filter out favicon and 404 noise
- Assert `errors.length === 0`

## Passing Criteria

All 9 steps must pass. A failure in any step fails the test.

## Playwright Config Addition

```ts
{
  name: 'mobile-purchase',
  testMatch: /e2e-purchase-flow\.spec\.ts/,
  use: {
    viewport: { width: 375, height: 812 },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on',
  },
}
```
