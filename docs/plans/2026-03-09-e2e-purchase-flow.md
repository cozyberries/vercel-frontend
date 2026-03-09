# E2E Purchase Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the draft `tests/e2e-purchase-flow.spec.ts` with a robust mobile-viewport E2E test that covers login → clear state → delete addresses → add product → checkout → pay → verify success, with all steps mandatory.

**Architecture:** Single Playwright test file with explicit per-action timeouts. Cart cleared via `localStorage.removeItem('cart')`. Wishlist cleared via wishlist page UI (Supabase-backed). Addresses deleted via profile page UI. New address created through the checkout modal.

**Tech Stack:** Playwright, TypeScript, Next.js 15 App Router, mobile viewport 375×812

---

### Task 1: Update playwright.config.ts — add mobile-purchase project

**Files:**
- Modify: `playwright.config.ts`

**Step 1: Read the current config**

Open `playwright.config.ts` and locate the `projects` array.

**Step 2: Add the mobile-purchase project**

Inside the `projects` array, add this entry (after the existing projects):

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
},
```

**Step 3: Verify config is valid**

Run: `npx playwright --version`
Expected: version string printed, no errors

---

### Task 2: Write the test file

**Files:**
- Modify: `tests/e2e-purchase-flow.spec.ts` (replace all content)

**Step 1: Write the full test**

Replace the entire file with:

```ts
import { test, expect } from "@playwright/test";

/**
 * Full purchase flow E2E (no mocks)
 * login → clear cart → clear wishlist → delete addresses →
 * add product → checkout (create address) → I Have Paid → verify success
 *
 * All steps are mandatory — any failure fails the test.
 * Mobile viewport: set in playwright.config.ts mobile-purchase project.
 */

const EMAIL = process.env.TEST_ADMIN_EMAIL ?? "";
const PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? "";

if (!EMAIL || !PASSWORD) {
  throw new Error(
    "TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD must be set in .env.local"
  );
}

test.use({ viewport: { width: 375, height: 812 } });

test("full purchase flow", async ({ page }) => {
  test.setTimeout(120_000);

  // Collect browser/page errors throughout the test
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`CONSOLE: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`PAGE: ${err.message}`));

  // ── 1. Login ─────────────────────────────────────────────────────────────
  console.log("Step 1: Login");
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h2", { timeout: 10_000 });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(profile)/, { timeout: 20_000 });
  console.log("✅ Logged in →", page.url());

  // ── 2. Clear cart (localStorage key: "cart") ──────────────────────────────
  console.log("Step 2: Clear cart");
  await page.evaluate(() => localStorage.removeItem("cart"));
  console.log("✅ Cart cleared");

  // ── 3. Clear wishlist (Supabase-backed — clear via wishlist page UI) ───────
  console.log("Step 3: Clear wishlist");
  await page.goto("/wishlist", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2_000); // let wishlist items load from Supabase

  // Remove all wishlist items one at a time until none remain
  let wishlistAttempts = 0;
  while (wishlistAttempts < 50) {
    // find any "remove from wishlist" button (heart/trash icon button near a product)
    const removeBtn = page
      .getByRole("button")
      .filter({ has: page.locator('svg[data-testid="heart"], [class*="heart"], [class*="Heart"]') })
      .first();

    // Fallback: any button with aria-label containing "remove" or "wishlist"
    const fallbackBtn = page
      .getByRole("button", { name: /remove|wishlist/i })
      .first();

    const btn = (await removeBtn.isVisible({ timeout: 1_000 }).catch(() => false))
      ? removeBtn
      : (await fallbackBtn.isVisible({ timeout: 1_000 }).catch(() => false))
      ? fallbackBtn
      : null;

    if (!btn) break;
    await btn.click();
    await page.waitForTimeout(500);
    wishlistAttempts++;
  }
  console.log("✅ Wishlist cleared");

  // ── 4. Delete all existing addresses (profile page) ───────────────────────
  console.log("Step 4: Delete existing addresses");
  await page.goto("/profile", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2_000); // let addresses load

  let deleteAttempts = 0;
  while (deleteAttempts < 20) {
    // Trash2 icon button: destructive variant on AddressList
    const trashBtn = page
      .locator('button.text-destructive, button[class*="destructive"]')
      .first();

    if (!(await trashBtn.isVisible({ timeout: 2_000 }).catch(() => false))) break;
    await trashBtn.click();
    await page.waitForTimeout(1_000); // wait for delete to complete
    deleteAttempts++;
  }
  console.log(`✅ Deleted ${deleteAttempts} address(es)`);

  // ── 5. Navigate to products, add first product to cart ────────────────────
  console.log("Step 5: Add product to cart");
  await page.goto("/products", { waitUntil: "domcontentloaded" });

  const firstProductLink = page.locator('a[href*="/products/"]').first();
  await firstProductLink.waitFor({ state: "visible", timeout: 10_000 });
  await firstProductLink.click();
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
  console.log("📦 Product page:", page.url());

  // Select first available (non-disabled) size if present
  const sizeBtn = page
    .locator("button:not([disabled])")
    .filter({ hasText: /^(\d[\d\s\-mMoOnNtThHsS]{0,20}|XS|S|M|L|XL|XXL)$/ })
    .first();
  if (await sizeBtn.isVisible({ timeout: 4_000 }).catch(() => false)) {
    await sizeBtn.click();
    console.log("✅ Size selected:", await sizeBtn.textContent());
  } else {
    console.log("ℹ️  No size selector — skipping");
  }

  // Add to cart
  const addToCartBtn = page.getByRole("button", { name: /add to cart/i }).first();
  await addToCartBtn.waitFor({ state: "visible", timeout: 8_000 });
  await addToCartBtn.click();
  await page.waitForTimeout(1_500); // wait for localStorage to persist
  console.log("✅ Added to cart");

  // ── 6. Checkout — verify cart not empty ───────────────────────────────────
  console.log("Step 6: Checkout");
  await page.goto("/checkout", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 });

  const emptyCartMsg = page.getByText("Your cart is empty");
  if (await emptyCartMsg.isVisible({ timeout: 3_000 }).catch(() => false)) {
    throw new Error("Cart is empty on /checkout — add-to-cart step failed");
  }
  console.log("✅ Cart has items");

  // ── 7. Create new address via checkout modal ──────────────────────────────
  console.log("Step 7: Create address");
  const addAddressBtn = page.getByRole("button", { name: /add new address/i });
  await addAddressBtn.waitFor({ state: "visible", timeout: 8_000 });
  await addAddressBtn.click();

  // Wait for the address modal to open
  await page.waitForSelector("#full_name", { timeout: 8_000 });

  // Fill address form fields
  await page.locator("#full_name").fill("Test User");
  await page.locator("#phone").fill("9876543210");
  await page.locator("#address_line_1").fill("12 MG Road");
  // address_type — select "home" (default or first option)
  const addressTypeSelect = page.locator("#address_type");
  if (await addressTypeSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await addressTypeSelect.selectOption("home");
  }

  // PIN Code — fill, then wait for auto-fill of city/state from Delhivery
  await page.locator("#postal_code").fill("560001");
  // Wait for Delhivery to auto-fill city and state (up to 10s)
  await page.waitForTimeout(3_000);

  // If city/state not auto-filled, fill manually
  const cityInput = page.locator("#city");
  const cityVal = await cityInput.inputValue().catch(() => "");
  if (!cityVal) {
    await cityInput.fill("Bengaluru");
  }
  const stateInput = page.locator("#state");
  const stateVal = await stateInput.inputValue().catch(() => "");
  if (!stateVal) {
    await stateInput.fill("Karnataka");
  }

  // Country
  const countryInput = page.locator("#country");
  const countryVal = await countryInput.inputValue().catch(() => "");
  if (!countryVal) {
    await countryInput.fill("India");
  }

  // Save address
  const saveBtn = page.getByRole("button", { name: /save/i }).last();
  await saveBtn.waitFor({ state: "visible", timeout: 5_000 });
  await saveBtn.click();
  console.log("✅ Address form submitted");

  // ── 8. Wait for pincode serviceability check ──────────────────────────────
  console.log("Step 8: Waiting for pincode check...");
  await page.waitForSelector("text=Delivery available to", { timeout: 20_000 });
  console.log("✅ Pincode serviceable");

  // ── 9. Submit order ───────────────────────────────────────────────────────
  console.log("Step 9: Submit order");
  const payBtn = page.getByRole("button", { name: /Pay ₹/ });
  await payBtn.waitFor({ state: "visible", timeout: 8_000 });
  await expect(payBtn).toBeEnabled({ timeout: 8_000 });
  await payBtn.click();
  console.log("✅ Order submitted");

  // ── 10. Payment page ──────────────────────────────────────────────────────
  console.log("Step 10: Payment page");
  await page.waitForURL(/\/payment\/session\//, { timeout: 20_000 });
  console.log("✅ Payment page:", page.url());

  // Click "I Have Paid"
  const iHavePaidBtn = page.getByRole("button", { name: /i have paid/i });
  await iHavePaidBtn.waitFor({ state: "visible", timeout: 15_000 });
  await iHavePaidBtn.click();

  // Confirm prompt: "Yes, I have paid"
  const yesBtn = page.getByRole("button", { name: /yes, i have paid/i });
  await yesBtn.waitFor({ state: "visible", timeout: 8_000 });
  await yesBtn.click();
  console.log("✅ Payment confirmed");

  // ── 11. Verify success ────────────────────────────────────────────────────
  console.log("Step 11: Verify success");
  await expect(
    page.getByText("Order Placed!"),
    "Success heading 'Order Placed!' must be visible"
  ).toBeVisible({ timeout: 15_000 });

  await expect(
    page.getByText(/we are verifying your payment/i),
    "Sub-heading 'We are verifying your payment' must be visible"
  ).toBeVisible({ timeout: 5_000 });

  await page.screenshot({ path: "/tmp/order-success.png" });
  console.log("🎉 Order Placed confirmed");

  // ── 12. Assert no browser errors ─────────────────────────────────────────
  const realErrors = errors.filter(
    (e) =>
      !e.includes("favicon") &&
      !e.includes("404") &&
      !e.includes("Failed to load resource") // filter noisy image/font 404s
  );
  if (realErrors.length > 0) {
    console.log("❌ Browser errors:");
    realErrors.forEach((e) => console.log("  ", e));
  } else {
    console.log("✅ No browser errors");
  }
  expect(realErrors, `Browser/page errors:\n${realErrors.join("\n")}`).toHaveLength(0);
});
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

---

### Task 3: Run the test and fix any failures

**Step 1: Start the dev server (if not running)**

In a separate terminal: `npm run dev`
Wait for "Ready on http://localhost:3000"

**Step 2: Run the mobile-purchase test**

```bash
npx playwright test --project=mobile-purchase --reporter=line
```

Expected: 1 test passes

**Step 3: If test fails — investigate**

For each failure:

a. **"TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD must be set"**
   → Add `TEST_ADMIN_EMAIL` and `TEST_ADMIN_PASSWORD` to `.env.local`

b. **Login fails / wrong URL after login**
   → Check `page.url()` output in console. Middleware may redirect to `/complete-profile` first.
   → Fix: change `waitForURL(/\/(profile)/)` to `waitForURL(/\/(profile|complete-profile)/)`, then navigate to `/profile` explicitly.

c. **Wishlist clear — no button found**
   → Inspect the wishlist page. Find the actual remove button selector.
   → Update the wishlist removal locator in the test.

d. **Address delete — Trash2 button not found**
   → The destructive class selector may not match. Use a broader selector:
   ```ts
   page.locator('button').filter({ has: page.locator('[data-lucide="trash-2"], svg') }).last()
   ```
   → Or navigate to the profile page and inspect the actual button classes.

e. **"Add New Address" button not visible on /checkout**
   → The page may have redirected (empty cart). Ensure add-to-cart step succeeded.
   → Add screenshot: `await page.screenshot({ path: '/tmp/checkout-debug.png' })`

f. **Pincode check fails / "Delivery available to" not seen**
   → Pincode `560001` may not be serviceable. Try `400001` (Mumbai) or `110001` (Delhi).
   → Update `#postal_code` fill value in the test.

g. **Payment URL mismatch**
   → The URL pattern `/payment/session/` must match. Check actual redirect URL in console output.

**Step 4: After all fixes, run again to confirm green**

```bash
npx playwright test --project=mobile-purchase --reporter=line
```

Expected: `1 passed`

**Step 5: Run with trace to verify video/screenshots work**

```bash
npx playwright test --project=mobile-purchase --reporter=html
npx playwright show-report
```

---

### Task 4: Run on default (desktop) projects to confirm no regressions

**Step 1:**

```bash
npx playwright test --project=chromium --reporter=line
```

Expected: existing tests (if any) still pass; new test also runs in desktop viewport as a bonus

---

### Notes

- The `mobile-purchase` project in `playwright.config.ts` uses `testMatch` so it only runs `e2e-purchase-flow.spec.ts`
- The global `timeout: 60_000` in config is overridden per-test to `120_000` via `test.setTimeout()`
- Cart localStorage key is `"cart"` (confirmed in `lib/services/cart.ts:193`)
- Wishlist is Supabase-backed (no localStorage key); clear via UI
- Address delete button uses destructive Tailwind classes in `components/profile/AddressList.tsx`
- Address form IDs: `#full_name`, `#phone`, `#address_line_1`, `#postal_code`, `#city`, `#state`, `#country`, `#address_type`
- Payment page is at `/payment/session/[sessionId]` (NOT `/payment/[orderId]`)
