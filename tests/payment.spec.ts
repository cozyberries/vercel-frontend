import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Payment Page E2E Tests
 *
 * Validates the custom UPI payment page flow:
 *   1. Payment page renders QR code, amount, and UPI app buttons
 *   2. UPI deep links are present for PhonePe, GPay, Paytm
 *   3. "I Have Paid" confirmation flow works end-to-end
 *   4. Error handling for failed payment confirmation
 *   5. Already-paid order shows confirmed state
 *
 * Auth: Uses a real test user session (saved by payment-auth.setup.ts via storageState).
 * Order/payment APIs are mocked so we don't need real orders.
 * Video recording is enabled via the project config in playwright.config.ts.
 */

test.describe.configure({ mode: "serial", retries: 1 });

// ── Mock Data ────────────────────────────────────────────────────────────────

const TEST_ORDER_ID = "test-order-123";

const mockOrder = {
  id: TEST_ORDER_ID,
  order_number: "ORD-1234567890",
  status: "payment_pending",
  user_id: "test-user-id",
  customer_email: "playwright-test@cozyberries.com",
  shipping_address: {
    full_name: "Playwright Test User",
    address_line_1: "123 Test Street",
    address_line_2: "Apt 4B",
    city: "Mumbai",
    state: "Maharashtra",
    postal_code: "400001",
    country: "India",
    phone: "+91 9876543210",
  },
  items: [
    {
      id: "item-1",
      name: "Cozy Berry Pyjama Set",
      price: 599,
      quantity: 2,
      image: "https://res.cloudinary.com/dxokykvty/image/upload/sample.jpg",
    },
    {
      id: "item-2",
      name: "Baby Romper",
      price: 399,
      quantity: 1,
      image: "https://res.cloudinary.com/dxokykvty/image/upload/sample2.jpg",
    },
  ],
  subtotal: 1597,
  delivery_charge: 100,
  tax_amount: 79.85,
  total_amount: 1776.85,
  currency: "INR",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockUpiLinks = {
  links: {
    phonepe: `phonepe://pay?pa=test@upi&pn=TEST%20USER&aid=testAid123&am=1776.85&cu=INR&tn=Cozyberries%20Purchase`,
    gpay: `tez://upi/pay?pa=test@upi&pn=TEST%20USER&aid=testAid123&am=1776.85&cu=INR&tn=Cozyberries%20Purchase`,
    paytm: `paytmmp://pay?pa=test@upi&pn=TEST%20USER&aid=testAid123&am=1776.85&cu=INR&tn=Cozyberries%20Purchase`,
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Set up API mocks for the payment page.
 * Auth is real (from storageState). Only order/payment APIs are mocked.
 */
async function setupMocks(
  page: Page,
  options?: {
    orderStatus?: string;
    confirmFails?: boolean;
  }
) {
  const order = {
    ...mockOrder,
    status: options?.orderStatus ?? "payment_pending",
  };

  // Mock GET /api/orders/[orderId]
  await page.route(`**/api/orders/${TEST_ORDER_ID}`, async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order }),
      });
    } else {
      await route.continue();
    }
  });

  // Mock GET /api/payments/upi-links
  await page.route("**/api/payments/upi-links*", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockUpiLinks),
    });
  });

  // Mock POST /api/payments/confirm
  await page.route("**/api/payments/confirm", async (route: Route) => {
    if (route.request().method() === "POST") {
      if (options?.confirmFails) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Failed to confirm payment" }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      }
    } else {
      await route.continue();
    }
  });

  // Mock notifications and activities (fire and forget)
  await page.route("**/api/notifications", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  await page.route("**/api/activities", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("Payment Page", () => {
  // ── 1. Page renders correctly ─────────────────────────────────────────

  test("should render payment page with QR code, amount, and UPI buttons", async ({
    page,
  }) => {
    await setupMocks(page);
    await page.goto(`/payment/${TEST_ORDER_ID}`);

    // Wait for page to load (check for amount)
    await expect(page.getByText("₹1776.85").first()).toBeVisible({
      timeout: 20_000,
    });

    // Payment heading
    await expect(page.getByText("Payment").first()).toBeVisible();

    // QR code image is visible
    const qrImage = page.locator('img[alt="UPI QR Code"]');
    await expect(qrImage).toBeVisible();

    // QR instruction text
    await expect(
      page.getByText("Scan QR code with any UPI app to pay")
    ).toBeVisible();

    // UPI app buttons
    await expect(page.getByText("PhonePe")).toBeVisible();
    await expect(page.getByText("GPay")).toBeVisible();
    await expect(page.getByText("Paytm")).toBeVisible();

    // "I Have Paid" button
    await expect(
      page.getByRole("button", { name: /I Have Paid/i })
    ).toBeVisible();

    // Order summary
    await expect(page.getByText("Order Summary")).toBeVisible();
    await expect(page.getByText("Cozy Berry Pyjama Set")).toBeVisible();
    await expect(page.getByText("Baby Romper")).toBeVisible();
  });

  // ── 2. UPI links are present ──────────────────────────────────────────

  test("should have correct UPI deep links for payment apps", async ({
    page,
  }) => {
    await setupMocks(page);
    await page.goto(`/payment/${TEST_ORDER_ID}`);

    await expect(page.getByText("PhonePe")).toBeVisible({ timeout: 20_000 });

    // PhonePe link
    const phonepeLink = page.locator('a:has-text("PhonePe")');
    await expect(phonepeLink).toHaveAttribute("href", /^phonepe:\/\/pay\?/);

    // GPay link
    const gpayLink = page.locator('a:has-text("GPay")');
    await expect(gpayLink).toHaveAttribute("href", /^tez:\/\/upi\/pay\?/);

    // Paytm link
    const paytmLink = page.locator('a:has-text("Paytm")');
    await expect(paytmLink).toHaveAttribute("href", /^paytmmp:\/\/pay\?/);
  });

  // ── 3. "I Have Paid" confirmation flow ────────────────────────────────

  test("should complete the 'I Have Paid' confirmation flow", async ({
    page,
  }) => {
    await setupMocks(page);
    await page.goto(`/payment/${TEST_ORDER_ID}`);

    // Wait for page to load
    await expect(
      page.getByRole("button", { name: /I Have Paid/i })
    ).toBeVisible({ timeout: 20_000 });

    // Click "I Have Paid"
    await page.getByRole("button", { name: /I Have Paid/i }).click();

    // Confirmation prompt should appear
    await expect(
      page.getByText(/Have you completed the payment of ₹1776\.85\?/)
    ).toBeVisible();

    // "Yes, I have paid" and "Not yet" buttons should appear
    await expect(
      page.getByRole("button", { name: /Yes, I have paid/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Not yet/i })
    ).toBeVisible();

    // Click "Yes, I have paid"
    await page.getByRole("button", { name: /Yes, I have paid/i }).click();

    // Success screen should appear
    await expect(page.getByText("Order Placed!")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText("We are verifying your payment")
    ).toBeVisible();

    // Navigation buttons
    await expect(
      page.getByRole("link", { name: "Continue Shopping" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View My Orders" })
    ).toBeVisible();
  });

  // ── 4. "Not yet" dismisses confirmation prompt ────────────────────────

  test("should dismiss confirmation prompt when 'Not yet' is clicked", async ({
    page,
  }) => {
    await setupMocks(page);
    await page.goto(`/payment/${TEST_ORDER_ID}`);

    await expect(
      page.getByRole("button", { name: /I Have Paid/i })
    ).toBeVisible({ timeout: 20_000 });

    // Click "I Have Paid"
    await page.getByRole("button", { name: /I Have Paid/i }).click();

    // Prompt visible
    await expect(
      page.getByRole("button", { name: /Not yet/i })
    ).toBeVisible();

    // Click "Not yet"
    await page.getByRole("button", { name: /Not yet/i }).click();

    // Prompt should be hidden, main button returns
    await expect(
      page.getByRole("button", { name: /I Have Paid/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Not yet/i })
    ).not.toBeVisible();
  });

  // ── 5. Error handling for failed confirmation ─────────────────────────

  test("should display error when payment confirmation fails", async ({
    page,
  }) => {
    await setupMocks(page, { confirmFails: true });
    await page.goto(`/payment/${TEST_ORDER_ID}`);

    await expect(
      page.getByRole("button", { name: /I Have Paid/i })
    ).toBeVisible({ timeout: 20_000 });

    // Click "I Have Paid"
    await page.getByRole("button", { name: /I Have Paid/i }).click();

    // Click "Yes, I have paid"
    await page.getByRole("button", { name: /Yes, I have paid/i }).click();

    // Error should be shown
    await expect(page.getByText(/Failed to confirm payment/)).toBeVisible({
      timeout: 10_000,
    });
  });

  // ── 6. Already-paid order shows confirmed state ───────────────────────

  test("should show confirmed state for already-paid order", async ({
    page,
  }) => {
    await setupMocks(page, { orderStatus: "processing" });
    await page.goto(`/payment/${TEST_ORDER_ID}`);

    // Should immediately show success screen
    await expect(page.getByText("Order Placed!")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText("We are verifying your payment")
    ).toBeVisible();
  });

  // ── 7. Order summary displays correct items and totals ────────────────

  test("should display order items and calculated totals", async ({
    page,
  }) => {
    await setupMocks(page);
    await page.goto(`/payment/${TEST_ORDER_ID}`);

    await expect(page.getByText("Order Summary")).toBeVisible({
      timeout: 20_000,
    });

    // Items
    await expect(page.getByText("Cozy Berry Pyjama Set")).toBeVisible();
    await expect(page.getByText("Baby Romper")).toBeVisible();

    // Quantities
    await expect(page.getByText("Qty: 2")).toBeVisible();
    await expect(page.getByText("Qty: 1")).toBeVisible();

    // Shipping address
    await expect(page.getByText("Shipping Address")).toBeVisible();
    await expect(page.getByText("Playwright Test User")).toBeVisible();
    await expect(page.getByText("123 Test Street")).toBeVisible();
  });
});
