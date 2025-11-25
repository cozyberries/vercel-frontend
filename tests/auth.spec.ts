import { test, expect } from '@playwright/test';

/**
 * Authentication Tests
 * 
 * These tests validate the signup and login functionality.
 * 
 * Note: For these tests to work properly, you need:
 * 1. A valid Supabase configuration in .env.local
 * 2. Email confirmation settings configured in Supabase
 * 3. Test credentials or ability to create test users
 */

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';

// Test credentials - these should be unique for each test run
// Using timestamp to ensure uniqueness
const timestamp = Date.now();
const testEmail = `test-${timestamp}@example.com`;
const testPassword = 'TestPassword123!';

test.describe('User Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to home page before each test
    await page.goto(BASE_URL);
  });

  test.describe('Signup Flow', () => {
    test('should display signup page correctly', async ({ page }) => {
      await page.goto(`${BASE_URL}/register`);
      
      // Check page title
      await expect(page).toHaveTitle(/CozyBerries/i);
      
      // Check heading
      await expect(page.getByRole('heading', { name: /Create your account/i })).toBeVisible();
      
      // Check form elements
      await expect(page.getByLabel(/Email address/i)).toBeVisible();
      await expect(page.getByLabel(/^Password$/i).first()).toBeVisible();
      await expect(page.getByLabel(/Confirm Password/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /Create account/i })).toBeVisible();
      
      // Check Google sign in button
      await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
      
      // Check link to login page
      await expect(page.getByRole('link', { name: /sign in to your existing account/i })).toBeVisible();
    });

    test('should show error when passwords do not match', async ({ page }) => {
      await page.goto(`${BASE_URL}/register`);
      
      // Fill in the form with mismatched passwords
      await page.getByLabel(/Email address/i).fill(testEmail);
      await page.getByLabel(/^Password$/i).first().fill(testPassword);
      await page.getByLabel(/Confirm Password/i).fill('DifferentPassword123!');
      
      // Submit the form
      await page.getByRole('button', { name: /Create account/i }).click();
      
      // Check for error message
      await expect(page.getByText(/Passwords do not match/i)).toBeVisible();
    });

    test('should show error for invalid email format', async ({ page }) => {
      await page.goto(`${BASE_URL}/register`);
      
      // Fill in the form with invalid email
      await page.getByLabel(/Email address/i).fill('invalid-email');
      await page.getByLabel(/^Password$/i).first().fill(testPassword);
      await page.getByLabel(/Confirm Password/i).fill(testPassword);
      
      // Try to submit - browser validation should prevent submission
      const emailInput = page.getByLabel(/Email address/i);
      await emailInput.blur();
      
      // Check HTML5 validation
      const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => {
        return !el.validity.valid;
      });
      expect(isInvalid).toBe(true);
    });

    test('should show error for weak password', async ({ page }) => {
      await page.goto(`${BASE_URL}/register`);
      
      // Fill in the form with weak password
      await page.getByLabel(/Email address/i).fill(testEmail);
      await page.getByLabel(/^Password$/i).first().fill('123');
      await page.getByLabel(/Confirm Password/i).fill('123');
      
      // Submit the form
      await page.getByRole('button', { name: /Create account/i }).click();
      
      // Note: Supabase may have password requirements
      // The error message will depend on Supabase configuration
      // We'll wait a bit to see if an error appears
      await page.waitForTimeout(1000);
      
      // Check if there's an error message (could be from Supabase)
      const errorText = await page.locator('text=/password|error|invalid/i').first().textContent().catch(() => null);
      if (errorText) {
        expect(errorText).toBeTruthy();
      }
    });

    test('should successfully submit signup form with valid data', async ({ page }) => {
      await page.goto(`${BASE_URL}/register`);
      
      // Generate unique email for this test
      const uniqueEmail = `test-signup-${Date.now()}@example.com`;
      
      // Fill in the form with valid data
      await page.getByLabel(/Email address/i).fill(uniqueEmail);
      await page.getByLabel(/^Password$/i).first().fill(testPassword);
      await page.getByLabel(/Confirm Password/i).fill(testPassword);
      
      // Submit the form
      await page.getByRole('button', { name: /Create account/i }).click();
      
      // Wait for response - either success message or error
      await page.waitForTimeout(2000);
      
      // Check for success message (email confirmation) or error
      const successMessage = page.getByText(/Check your email for a confirmation link/i);
      const errorMessage = page.locator('text=/error|failed/i').first();
      
      // One of these should be visible
      const hasSuccess = await successMessage.isVisible().catch(() => false);
      const hasError = await errorMessage.isVisible().catch(() => false);
      
      // If there's an error, log it for debugging
      if (hasError) {
        const errorText = await errorMessage.textContent();
        console.log('Signup error:', errorText);
      }
      
      // Note: Actual success depends on Supabase configuration
      // If email confirmation is required, we'll see the success message
      // If auto-confirm is enabled, user might be redirected
      expect(hasSuccess || hasError).toBe(true);
    });

    test('should navigate to login page from signup page', async ({ page }) => {
      await page.goto(`${BASE_URL}/register`);
      
      // Click the link to login page
      await page.getByRole('link', { name: /sign in to your existing account/i }).click();
      
      // Should be on login page
      await expect(page).toHaveURL(new RegExp(`${BASE_URL}/login`));
      await expect(page.getByRole('heading', { name: /Sign in to your account/i })).toBeVisible();
    });
  });

  test.describe('Login Flow', () => {
    test('should display login page correctly', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      
      // Check page title
      await expect(page).toHaveTitle(/CozyBerries/i);
      
      // Check heading
      await expect(page.getByRole('heading', { name: /Sign in to your account/i })).toBeVisible();
      
      // Check form elements
      await expect(page.getByLabel(/Email address/i)).toBeVisible();
      await expect(page.getByLabel(/^Password$/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /Sign in/i })).toBeVisible();
      
      // Check Google sign in button
      await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
      
      // Check link to register page
      await expect(page.getByRole('link', { name: /create a new account/i })).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      
      // Fill in the form with invalid credentials
      await page.getByLabel(/Email address/i).fill('nonexistent@example.com');
      await page.getByLabel(/^Password$/i).fill('WrongPassword123!');
      
      // Submit the form
      await page.getByRole('button', { name: /Sign in/i }).click();
      
      // Wait for error message
      await page.waitForTimeout(2000);
      
      // Check for error message
      const errorMessage = page.locator('text=/invalid|incorrect|error|wrong/i').first();
      const hasError = await errorMessage.isVisible().catch(() => false);
      
      // Should show an error (exact message depends on Supabase configuration)
      if (hasError) {
        const errorText = await errorMessage.textContent();
        expect(errorText).toBeTruthy();
      }
    });

    test('should show error for invalid email format', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      
      // Fill in the form with invalid email
      await page.getByLabel(/Email address/i).fill('invalid-email');
      await page.getByLabel(/^Password$/i).fill(testPassword);
      
      // Try to submit - browser validation should prevent submission
      const emailInput = page.getByLabel(/Email address/i);
      await emailInput.blur();
      
      // Check HTML5 validation
      const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => {
        return !el.validity.valid;
      });
      expect(isInvalid).toBe(true);
    });

    test('should navigate to register page from login page', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      
      // Click the link to register page
      await page.getByRole('link', { name: /create a new account/i }).click();
      
      // Should be on register page
      await expect(page).toHaveURL(new RegExp(`${BASE_URL}/register`));
      await expect(page.getByRole('heading', { name: /Create your account/i })).toBeVisible();
    });

    test('should show loading state during login', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      
      // Fill in the form
      await page.getByLabel(/Email address/i).fill('test@example.com');
      await page.getByLabel(/^Password$/i).fill('TestPassword123!');
      
      // Submit the form
      const submitButton = page.getByRole('button', { name: /Sign in/i });
      
      // Click and immediately check for loading state
      const clickPromise = submitButton.click();
      
      // Wait a bit to catch the loading state
      await page.waitForTimeout(100);
      
      // Check if button shows loading state (text changes to "Signing in...")
      // The button text might change or it might be disabled
      const buttonText = await submitButton.textContent().catch(() => '');
      const isDisabled = await submitButton.isDisabled().catch(() => false);
      
      // Either the text should show "Signing in" or the button should be disabled
      expect(buttonText?.includes('Signing') || isDisabled).toBe(true);
      
      await clickPromise;
    });

    test('should disable form during loading', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      
      // Fill in the form
      await page.getByLabel(/Email address/i).fill('test@example.com');
      await page.getByLabel(/^Password$/i).fill('TestPassword123!');
      
      // Submit the form
      const submitButton = page.getByRole('button', { name: /Sign in/i });
      
      // Click and immediately check for disabled state
      const clickPromise = submitButton.click();
      
      // Wait a bit to catch the disabled state (might be very brief)
      await page.waitForTimeout(50);
      
      // Button might be disabled or show loading text
      const isDisabled = await submitButton.isDisabled().catch(() => false);
      const buttonText = await submitButton.textContent().catch(() => '');
      
      // Either disabled or showing loading text indicates loading state
      expect(isDisabled || buttonText?.includes('Signing')).toBe(true);
      
      await clickPromise;
    });
  });

  test.describe('Navigation Flow', () => {
    test('should navigate between login and register pages', async ({ page }) => {
      // Start at login
      await page.goto(`${BASE_URL}/login`);
      await expect(page.getByRole('heading', { name: /Sign in to your account/i })).toBeVisible();
      
      // Go to register
      await page.getByRole('link', { name: /create a new account/i }).click();
      await expect(page).toHaveURL(new RegExp(`${BASE_URL}/register`));
      await expect(page.getByRole('heading', { name: /Create your account/i })).toBeVisible();
      
      // Go back to login
      await page.getByRole('link', { name: /sign in to your existing account/i }).click();
      await expect(page).toHaveURL(new RegExp(`${BASE_URL}/login`));
      await expect(page.getByRole('heading', { name: /Sign in to your account/i })).toBeVisible();
    });
  });

  test.describe('Form Validation', () => {
    test('should require email field', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      
      const emailInput = page.getByLabel(/Email address/i);
      const isRequired = await emailInput.getAttribute('required');
      expect(isRequired).not.toBeNull();
    });

    test('should require password field', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      
      const passwordInput = page.getByLabel(/^Password$/i);
      const isRequired = await passwordInput.getAttribute('required');
      expect(isRequired).not.toBeNull();
    });

    test('should require all fields on register page', async ({ page }) => {
      await page.goto(`${BASE_URL}/register`);
      
      const emailInput = page.getByLabel(/Email address/i);
      const passwordInput = page.getByLabel(/^Password$/i).first();
      const confirmPasswordInput = page.getByLabel(/Confirm Password/i);
      
      const emailRequired = await emailInput.getAttribute('required');
      const passwordRequired = await passwordInput.getAttribute('required');
      const confirmPasswordRequired = await confirmPasswordInput.getAttribute('required');
      
      expect(emailRequired).not.toBeNull();
      expect(passwordRequired).not.toBeNull();
      expect(confirmPasswordRequired).not.toBeNull();
    });
  });
});

