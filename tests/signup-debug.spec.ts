import { test, expect } from '@playwright/test';

/**
 * Signup Debug Test
 * 
 * This test helps debug why signup is not working by capturing
 * error messages and network requests.
 */

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';
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
  await page.goto(`${BASE_URL}/register`);

  // Fill in the form
  await page.getByLabel(/Email address/i).fill(testEmail);
  await page.getByLabel(/^Password$/i).first().fill(testPassword);
  await page.getByLabel(/Confirm Password/i).fill(testPassword);

  // Submit the form
  await page.getByRole('button', { name: /Create account/i }).click();

  // Wait for response
  await page.waitForTimeout(5000);

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

  // The test should fail if there are errors, but we've captured all the info
  if (hasError && !hasSuccess) {
    console.log('\n❌ SIGNUP FAILED - Check error messages above');
    throw new Error(`Signup failed. Errors: ${errorMessages.join('; ')}`);
  } else if (hasSuccess) {
    console.log('\n✅ SIGNUP APPEARS SUCCESSFUL - Check success messages above');
  } else {
    console.log('\n⚠️  UNCLEAR RESULT - No clear error or success message');
  }
});




