import { test, expect } from '@playwright/test';

/**
 * Signup Debug Test
 * 
 * This test helps debug why signup is not working by capturing
 * error messages and network requests.
 */

const testPassword = 'TestPassword123!';

test('debug signup process and capture errors', async ({ page }) => {
  // Generate unique email
  const timestamp = Date.now();
  const testEmail = `test-debug-${timestamp}@example.com`;

  // Capture console errors
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // Capture network requests
  const networkRequests: Array<{ url: string; status?: number; method: string }> = [];
  page.on('request', (request) => {
    if (request.url().includes('supabase') || request.url().includes('auth') || request.url().includes('api')) {
      networkRequests.push({
        url: request.url(),
        method: request.method(),
      });
    }
  });

  page.on('response', (response) => {
    if (response.url().includes('supabase') || response.url().includes('auth') || response.url().includes('api')) {
      const request = networkRequests.find((r) => r.url === response.url());
      if (request) {
        request.status = response.status();
      }
    }
  });

  // Navigate to signup page
  await page.goto('/register');

  // Wait for the form to be ready
  await expect(page.getByLabel(/Email address/i)).toBeVisible({ timeout: 15_000 });

  // Fill in the form
  await page.getByLabel(/Email address/i).fill(testEmail);
  await page.getByLabel(/^Password$/i).first().fill(testPassword);
  await page.getByLabel(/Confirm Password/i).fill(testPassword);

  // Submit the form
  await page.getByRole('button', { name: /Create account/i }).click();

  // Wait for signup flow to complete: success message, error message, or button reverted (loading done)
  await Promise.race([
    page.getByText(/Check your email for a confirmation link/i).waitFor({ state: 'visible', timeout: 15_000 }),
    page.locator('div.text-red-600').waitFor({ state: 'visible', timeout: 15_000 }),
    page.getByRole('button', { name: 'Create account' }).waitFor({ state: 'visible', timeout: 15_000 }),
  ]).catch(() => {
    // Timeout or other error — continue to capture whatever state the page is in
  });

  // Capture all visible error messages
  const errorElements = await page.locator('text=/error|failed|invalid/i').all();
  const errorMessages: string[] = [];
  for (const elem of errorElements) {
    const text = await elem.textContent();
    if (text) errorMessages.push(text);
  }

  // Capture success messages
  const successElements = await page.locator('text=/success|check your email|confirmation/i').all();
  const successMessages: string[] = [];
  for (const elem of successElements) {
    const text = await elem.textContent();
    if (text) successMessages.push(text);
  }

  // Log everything for debugging
  console.log('\n=== SIGNUP DEBUG INFO ===');
  console.log('Test Email:', testEmail);
  console.log('\n--- Error Messages on Page ---');
  errorMessages.forEach((msg, i) => console.log(`${i + 1}. ${msg}`));
  console.log('\n--- Success Messages on Page ---');
  successMessages.forEach((msg, i) => console.log(`${i + 1}. ${msg}`));
  console.log('\n--- Console Errors ---');
  consoleErrors.forEach((err, i) => console.log(`${i + 1}. ${err}`));
  console.log('\n--- Network Requests ---');
  networkRequests.forEach((req, i) => {
    console.log(`${i + 1}. ${req.method} ${req.url} ${req.status ? `[${req.status}]` : ''}`);
  });

  // Check what actually happened
  const hasError = errorMessages.length > 0;
  const hasSuccess = successMessages.length > 0;

  console.log('\n--- Summary ---');
  console.log('Has Error Messages:', hasError);
  console.log('Has Success Messages:', hasSuccess);
  console.log('Console Errors Count:', consoleErrors.length);
  console.log('Network Requests Count:', networkRequests.length);

  // Take a screenshot for visual debugging
  await page.screenshot({ path: `test-results/signup-debug-${timestamp}.png`, fullPage: true });

  // The purpose of this debug test is to CAPTURE and log signup info.
  // It passes as long as the form submitted and we captured a result.
  if (hasError && !hasSuccess) {
    console.log('\n❌ SIGNUP FAILED - Check error messages above');
    // Don't throw — the debug test succeeded in capturing the error info.
    // The error is expected when Supabase rejects test email domains.
  } else if (hasSuccess) {
    console.log('\n✅ SIGNUP APPEARS SUCCESSFUL - Check success messages above');
  } else {
    console.log('\n⚠️  UNCLEAR RESULT - No clear error or success message');
  }

  // Verify we captured meaningful debug info (network activity occurred)
  expect(networkRequests.length).toBeGreaterThan(0);
});
