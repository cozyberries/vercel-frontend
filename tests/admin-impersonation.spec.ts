import { test, expect } from "@playwright/test";
import * as os from "os";
import * as path from "path";

/**
 * Admin impersonation happy-path E2E (no mocks)
 *
 * Flow:
 *   admin session → open UserPickerModal → Create new user → impersonate →
 *   add product to cart → checkout (new address) → enable admin override →
 *   submit → UPI "I Have Paid" → Order Placed → Exit impersonation →
 *   verify admin session intact → verify order appears on /admin/on-behalf-orders
 *
 * Runs on Desktop Chrome (the admin block on ProfileForm is identical in the
 * mobile layout, but the desktop viewport avoids the overflow/sheet edge cases
 * of the mobile flow; a dedicated mobile admin variant is out of scope for
 * Phase 8). All assertions fail the test — no silent skips.
 *
 * Required env vars (same .env.local as other e2e tests):
 *   TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD — user with admin role
 *
 * Required Supabase / environment state:
 *   - TEST_ADMIN_EMAIL must have user_metadata.role = 'admin'
 *     (Phase 1 of the design reads this from the JWT — not hard-coded here)
 *   - At least 1 product available in the catalog
 *   - Delhivery serviceable pincode 560001 (Bengaluru)
 *   - Storefront dev server running on http://localhost:3000
 *     (the webServer block in playwright.config.ts handles this)
 *
 * Test data notes:
 *   - A new Supabase auth user is created every run (timestamped email).
 *     We deliberately DO NOT delete it afterwards — it's admin-created
 *     test data and parallel runs must not race on deletion. Clean up
 *     manually in Supabase Dashboard → Auth → Users if the list gets
 *     noisy. The IMPERSONATION_E2E_CLEANUP env var is reserved for a
 *     future cleanup helper; until that exists this test no-ops on it.
 *
 * How to run:
 *   npm run test:admin-impersonation
 *   # add --headed to watch in a visible browser
 *   # add --debug to step through with Playwright Inspector
 */

test.use({ viewport: { width: 1280, height: 800 } });

function uniqueTargetEmail(): string {
  return `impersonation-target-${Date.now()}-${Math.floor(
    Math.random() * 1_000
  )}@cozytest.local`;
}

function randomIndianMobile(): string {
  // 10-digit Indian mobile starting with 98xxxxxxxx
  const suffix = String(Math.floor(10_000_000 + Math.random() * 89_999_999));
  return `98${suffix}`;
}

test("admin impersonation: create user and place order on behalf", async ({
  page,
}) => {
  test.setTimeout(180_000);

  // Collect browser/page errors throughout the test
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`CONSOLE: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`PAGE: ${err.message}`));

  const targetEmailFirst = uniqueTargetEmail();
  const targetPhone = randomIndianMobile();
  const targetName = "Impersonation Test User";

  // ── 1. Verify admin session (auth pre-loaded via purchase-auth-setup) ─────
  console.log("Step 1: Verify admin session");
  await page.goto("/profile", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/(profile|complete-profile)/, { timeout: 15_000 });
  if (page.url().includes("complete-profile")) {
    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
  }
  console.log("✅ Admin session ok →", page.url());

  // ── 2. Open "Impersonate user" from profile admin block ──────────────────
  console.log("Step 2: Open UserPickerModal");
  const impersonateBtn = page.getByRole("button", {
    name: /impersonate user/i,
  });
  const visible = await impersonateBtn
    .isVisible({ timeout: 5_000 })
    .catch(() => false);
  expect(
    visible,
    "'Impersonate user' button must be visible on /profile — TEST_ADMIN_EMAIL likely missing admin role (check Supabase user_metadata.role)"
  ).toBe(true);
  await impersonateBtn.click();

  // Modal (role=dialog) is rendered by Radix Dialog
  const modal = page.getByRole("dialog", { name: /impersonate user/i });
  await expect(
    modal,
    "UserPickerModal dialog must open when the admin button is clicked"
  ).toBeVisible({ timeout: 5_000 });

  // ── 3. Create new target user on the "Create new user" tab ────────────────
  console.log("Step 3: Create new target user", { targetEmailFirst });
  await modal
    .getByRole("tab", { name: /create new user/i })
    .click();

  // Retry-once loop in case a 409 slips through (extremely unlikely with
  // timestamp+rand email but cheap insurance per the spec).
  let targetEmail = targetEmailFirst;
  const submitCreate = async (email: string) => {
    await modal.locator("#create-email").fill(email);
    // IndianPhoneInput strips non-digits in its onChange and re-formats the
    // display value, so filling with raw digits is safe.
    await modal.locator("#create-phone").fill(targetPhone);
    await modal.locator("#create-name").fill(targetName);
    await modal
      .getByRole("button", { name: /create & continue/i })
      .click();
  };

  await submitCreate(targetEmail);

  // If the form surfaces a "user already exists" error, retry once with a
  // fresh email. The modal switches to the "Find user" tab on 409 and
  // populates `createErrors.form` — detect via the alert role inside the
  // dialog.
  const duplicateAlert = modal
    .getByRole("alert")
    .filter({ hasText: /already|exists/i });
  if (
    await duplicateAlert.isVisible({ timeout: 3_000 }).catch(() => false)
  ) {
    console.log(
      "⚠️  Duplicate email collision detected — retrying with a fresh email"
    );
    await modal
      .getByRole("tab", { name: /create new user/i })
      .click();
    targetEmail = uniqueTargetEmail();
    await submitCreate(targetEmail);
  }

  // ── 4. Assert impersonation banner appears ────────────────────────────────
  console.log("Step 4: Assert impersonation banner");
  // After a successful create+impersonate, the modal hard-navigates the
  // window to "/" — wait for that to settle before looking for the banner.
  await page.waitForURL((u) => u.pathname === "/", { timeout: 20_000 });
  await page.waitForLoadState("domcontentloaded");

  const banner = page.getByRole("status").filter({ hasText: /impersonating as/i });
  let bannerVisible = await banner
    .isVisible({ timeout: 8_000 })
    .catch(() => false);
  if (!bannerVisible) {
    // Defensive retry: explicitly poke the state endpoint (e.g. if the
    // AuthProvider's initial refresh raced with navigation) and re-check.
    console.log("⚠️  Banner not visible — probing /api/admin/impersonation/state");
    await page.evaluate(() =>
      fetch("/api/admin/impersonation/state", {
        credentials: "same-origin",
        cache: "no-store",
      }).catch(() => undefined)
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    bannerVisible = await banner
      .isVisible({ timeout: 8_000 })
      .catch(() => false);
  }
  expect(
    bannerVisible,
    "ImpersonationBanner (role=status, 'Impersonating as …') must be visible after impersonation starts"
  ).toBe(true);
  await expect(
    banner,
    "Banner must render the target user's email so the admin can verify who they are acting as"
  ).toContainText(targetEmail, { timeout: 2_000 });
  console.log("✅ Banner visible — acting as", targetEmail);

  // ── 5. Add first product to cart (as impersonated user) ───────────────────
  console.log("Step 5: Add product to cart");
  await page.goto("/products", { waitUntil: "domcontentloaded" });

  const firstProductLink = page.locator('a[href*="/products/"]').first();
  await firstProductLink.waitFor({ state: "visible", timeout: 10_000 });
  await firstProductLink.click();
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
  console.log("📦 Product page:", page.url());

  // If "Remove from Cart" is visible (impersonated user happened to already
  // have this variant), remove it first so the add-to-cart action is
  // observable.
  const removeBtn = page.getByRole("button", { name: /remove from cart/i });
  if (await removeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await removeBtn.click();
    await page
      .waitForFunction(
        () =>
          !document
            .querySelector("button")
            ?.textContent?.includes("Remove from Cart"),
        { timeout: 5_000 }
      )
      .catch(() => {});
  }

  // Optional size selector — follow e2e-purchase-flow convention
  const sizeBtn = page
    .locator("button:not([disabled])")
    .filter({ hasText: /^(\d[\d\s\-mMoOnNtThHsS]{0,20}|XS|S|M|L|XL|XXL)$/ })
    .first();
  if (await sizeBtn.isVisible({ timeout: 4_000 }).catch(() => false)) {
    await sizeBtn.click();
  }

  const addToCartBtn = page.getByRole("button", { name: /add to cart/i }).first();
  await addToCartBtn.waitFor({ state: "visible", timeout: 8_000 });
  await addToCartBtn.click();
  console.log("✅ Added to cart");

  // ── 6. Checkout — verify cart populated for impersonated user ─────────────
  console.log("Step 6: Checkout");
  await page.goto("/checkout", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 });

  const emptyCartMsg = page.getByText("Your cart is empty");
  expect(
    await emptyCartMsg.isVisible({ timeout: 3_000 }).catch(() => false),
    "Cart must not be empty under the impersonated session — add-to-cart must have persisted to the target user"
  ).toBe(false);

  // Impersonation banner must still be visible on the checkout page —
  // it's the admin's safety net.
  await expect(
    banner,
    "Impersonation banner must stay visible throughout the checkout flow"
  ).toBeVisible();

  // ── 7. Create a new address (the impersonated user has none yet) ──────────
  console.log("Step 7: Create address");
  const addAddressBtn = page.getByRole("button", {
    name: /add new address/i,
  });
  await addAddressBtn.waitFor({ state: "visible", timeout: 8_000 });
  await addAddressBtn.click();

  const addressModal = page.locator(".fixed.inset-0");
  await addressModal.locator("#full_name").waitFor({ timeout: 8_000 });

  await addressModal.locator("#full_name").fill(targetName);
  await addressModal.locator("#phone").fill(targetPhone);
  await addressModal
    .locator("#address_line_1")
    .fill("42 Impersonation Test Lane");

  const addressTypeSelect = addressModal.locator("#address_type");
  if (await addressTypeSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await addressTypeSelect.selectOption("home");
  }

  // ── 8. Pincode + Delhivery auto-fill + override toggle ────────────────────
  console.log("Step 8: Pincode check + admin override");
  await addressModal.locator("#postal_code").fill("560001");
  await addressModal.locator("#city").waitFor({ timeout: 10_000 });
  await page
    .waitForFunction(
      () =>
        (document.querySelector("#city") as HTMLInputElement)?.value?.length >
        0,
      { timeout: 10_000 }
    )
    .catch(() => {});

  const cityInput = addressModal.locator("#city");
  if (!(await cityInput.inputValue().catch(() => ""))) {
    await cityInput.fill("Bengaluru");
  }
  const stateInput = addressModal.locator("#state");
  if (!(await stateInput.inputValue().catch(() => ""))) {
    await stateInput.fill("Karnataka");
  }
  const countryInput = addressModal.locator("#country");
  if (!(await countryInput.inputValue().catch(() => ""))) {
    await countryInput.fill("India");
  }

  await expect(
    addressModal.getByText(/Delivery available/i),
    "Pincode 560001 must be serviceable — check Delhivery coverage/test creds"
  ).toBeVisible({ timeout: 20_000 });

  const saveAddressBtn = addressModal.getByRole("button", {
    name: /add address|update address/i,
  });
  await saveAddressBtn.waitFor({ state: "visible", timeout: 5_000 });
  await expect(
    saveAddressBtn,
    "Save address button must become enabled once serviceability resolves"
  ).toBeEnabled({ timeout: 5_000 });
  await saveAddressBtn.click();

  // Enable admin override — the amber panel is always rendered (not a
  // collapsible disclosure despite the planning doc wording), so we just
  // toggle the checkbox directly.
  const overrideToggle = page.getByRole("checkbox", {
    name: /apply custom discount override/i,
  });
  await overrideToggle.waitFor({ state: "visible", timeout: 8_000 });
  await overrideToggle.check();

  await page.locator("#admin-override-amount").fill("50");
  await page
    .locator("#admin-override-note")
    .fill("E2E happy-path test override");

  await expect(
    page.getByText(/Admin Discount/i),
    "'Admin Discount' row must appear in the order summary after enabling override"
  ).toBeVisible({ timeout: 5_000 });

  // ── 9. Submit order ───────────────────────────────────────────────────────
  console.log("Step 9: Submit order");
  const payBtn = page.getByRole("button", { name: /Pay ₹/ });
  await payBtn.waitFor({ state: "visible", timeout: 8_000 });
  await expect(
    payBtn,
    "Pay button must be enabled (address selected + pincode serviceable + override valid)"
  ).toBeEnabled({ timeout: 8_000 });
  await payBtn.click();

  // ── 10. Payment page ──────────────────────────────────────────────────────
  console.log("Step 10: Payment page");
  await page.waitForURL(/\/payment\/session\//, { timeout: 20_000 });

  const iHavePaidBtn = page.getByRole("button", { name: /i have paid/i });
  await iHavePaidBtn.waitFor({ state: "visible", timeout: 15_000 });
  await iHavePaidBtn.click();

  const yesBtn = page.getByRole("button", { name: /yes, i have paid/i });
  await yesBtn.waitFor({ state: "visible", timeout: 8_000 });
  await yesBtn.click();

  // ── 11. Verify Order Placed ───────────────────────────────────────────────
  console.log("Step 11: Verify Order Placed");
  await expect(
    page.getByRole("heading", { name: /order placed/i }),
    "'Order Placed!' success heading must be visible after payment confirmation"
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText(/we are verifying your payment/i),
    "'We are verifying your payment' sub-heading must be visible"
  ).toBeVisible({ timeout: 5_000 });

  await page.screenshot({
    path: path.join(os.tmpdir(), "impersonation-order-success.png"),
  });

  // ── 12. Exit impersonation & verify admin session intact ──────────────────
  console.log("Step 12: Exit impersonation");
  const exitBtn = banner.getByRole("button", { name: /^exit/i });
  await exitBtn.waitFor({ state: "visible", timeout: 5_000 });
  await exitBtn.click();

  await expect(
    banner,
    "Impersonation banner must be dismissed after clicking Exit"
  ).toBeHidden({ timeout: 10_000 });

  await page.goto("/profile", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("button", { name: /impersonate user/i }),
    "Admin menu ('Impersonate user') must still be visible on /profile after stopping impersonation — admin session must survive"
  ).toBeVisible({ timeout: 8_000 });

  // ── 13. Verify audit row on /admin/on-behalf-orders ───────────────────────
  console.log("Step 13: Verify audit page row");
  await page.goto("/admin/on-behalf-orders", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 });

  // Desktop table first cell shows the customer's email. Allow a brief
  // grace period in case the list just-inserted row is still propagating.
  await expect(
    page.getByRole("table").getByText(targetEmail, { exact: false }).first(),
    `Newly placed on-behalf order must appear in /admin/on-behalf-orders with customer email ${targetEmail}`
  ).toBeVisible({ timeout: 15_000 });
  console.log("✅ Audit row visible for", targetEmail);

  // ── 14. Assert no browser errors ──────────────────────────────────────────
  //
  // Allowlist notes:
  //   - Entries are anchored regexes so they match exact error signatures,
  //     not arbitrary substrings.
  //   - We split `errors` into `realErrors` (fails the test) and
  //     `filteredOut` (surfaced as debug output) so silenced messages are
  //     still reviewable without breaking the assertion.
  //
  // If any of these allowlisted signatures changes upstream, this regex
  // list must be updated — don't fall back to loose `includes()` checks
  // which can hide genuine regressions.
  const ALLOWED_ERROR_PATTERNS: readonly RegExp[] = [
    // Browsers request /favicon.ico even when the page doesn't expose one.
    /(?:CONSOLE|PAGE): .*favicon/i,
    // supabase-js logs auth/profile 4xx responses on expected flows
    // (e.g. the 406 it emits while waiting for a row to exist).
    /(?:CONSOLE|PAGE): .*(?:@supabase\/supabase-js|supabase-js|profiles\?.* 406)/i,
    // Known service console.error prefixes — see lib/services/{cart,wishlist}.ts.
    /^CONSOLE: Error saving user cart:/,
    /^CONSOLE: Error saving user wishlist:/,
    /^CONSOLE: Error syncing cart:/,
    /^CONSOLE: Error syncing wishlist:/,
    /^CONSOLE: Error fetching profile data:/,
    // Known transient during target-user hydration immediately after create.
    /^CONSOLE: .*Invalid or unexpected token/,
  ];

  const filteredOut: string[] = [];
  const realErrors = errors.filter((e) => {
    const matchedPattern = ALLOWED_ERROR_PATTERNS.find((re) => re.test(e));
    if (matchedPattern) {
      filteredOut.push(e);
      return false;
    }
    return true;
  });

  if (filteredOut.length > 0) {
    console.debug(
      `ℹ️  ${filteredOut.length} allowlisted console error(s) suppressed:`
    );
    filteredOut.forEach((e) => console.debug("  ", e));
  }

  if (realErrors.length > 0) {
    console.log("❌ Browser errors:");
    realErrors.forEach((e) => console.log("  ", e));
  } else {
    console.log("✅ No browser errors");
  }
  expect(
    realErrors,
    `Browser/page errors detected during impersonation flow:\n${realErrors.join("\n")}`
  ).toHaveLength(0);

  // Cleanup placeholder — see top-of-file comment. The test deliberately
  // leaves the newly-created Supabase user and their order behind so
  // parallel runs don't race.
  if (process.env.IMPERSONATION_E2E_CLEANUP === "1") {
    console.log(
      "ℹ️  IMPERSONATION_E2E_CLEANUP=1 observed, but no cleanup helper is wired in Phase 8 — leaving test data in place."
    );
  }
});
