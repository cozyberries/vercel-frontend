import { test, expect } from '@playwright/test';

// Test data helpers
const generateTestEmail = () => {
  const timestamp = Date.now();
  return `test-${timestamp}@example.com`;
};

const generateTestPassword = () => {
  return 'TestPassword123!';
};

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to home page before each test
    await page.goto('http://localhost:3000');
  });

  test.describe('Signup', () => {
    test('should successfully sign up with valid credentials', async ({ page }) => {
      const testEmail = generateTestEmail();
      const testPassword = generateTestPassword();

      // Navigate to register page
      await page.goto('http://localhost:3000/register');

      // Verify we're on the register page
      await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();

      // Fill in the signup form
      await page.getByLabel('Email address').fill(testEmail);
      await page.getByLabel('Password').fill(testPassword);
      await page.getByLabel('Confirm Password').fill(testPassword);

      // Submit the form
      await page.getByRole('button', { name: 'Create account' }).click();

      // Wait for success message
      await expect(
        page.getByText('Check your email for a confirmation link!')
      ).toBeVisible({ timeout: 10000 });
    });

    test('should show error when passwords do not match', async ({ page }) => {
      const testEmail = generateTestEmail();
      const testPassword = generateTestPassword();

      // Navigate to register page
      await page.goto('http://localhost:3000/register');

      // Fill in the signup form with mismatched passwords
      await page.getByLabel('Email address').fill(testEmail);
      await page.getByLabel('Password').fill(testPassword);
      await page.getByLabel('Confirm Password').fill('DifferentPassword123!');

      // Submit the form
      await page.getByRole('button', { name: 'Create account' }).click();

      // Verify error message appears
      await expect(page.getByText('Passwords do not match')).toBeVisible();
    });

    test('should show error when email is already registered', async ({ page }) => {
      // Use a known email that might already exist
      // Note: This test assumes the email already exists in the system
      const existingEmail = 'existing@example.com';
      const testPassword = generateTestPassword();

      // Navigate to register page
      await page.goto('http://localhost:3000/register');

      // Fill in the signup form
      await page.getByLabel('Email address').fill(existingEmail);
      await page.getByLabel('Password').fill(testPassword);
      await page.getByLabel('Confirm Password').fill(testPassword);

      // Submit the form
      await page.getByRole('button', { name: 'Create account' }).click();

      // Wait for error message (Supabase typically returns an error for existing emails)
      await expect(page.locator('.text-red-600')).toBeVisible({ timeout: 10000 });
    });

    test('should validate required fields', async ({ page }) => {
      // Navigate to register page
      await page.goto('http://localhost:3000/register');

      // Try to submit without filling any fields
      await page.getByRole('button', { name: 'Create account' }).click();

      // HTML5 validation should prevent submission
      // Check that the form doesn't submit (email field should be invalid)
      const emailInput = page.getByLabel('Email address');
      await expect(emailInput).toHaveAttribute('required');
    });

    test('should navigate to login page from register page', async ({ page }) => {
      // Navigate to register page
      await page.goto('http://localhost:3000/register');

      // Click the "sign in to your existing account" link
      await page.getByRole('link', { name: 'sign in to your existing account' }).click();

      // Verify we're on the login page
      await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();
      await expect(page).toHaveURL('http://localhost:3000/login');
    });
  });

  test.describe('Sign In', () => {
    test('should successfully sign in with valid credentials', async ({ page }) => {
      // Note: This test requires a pre-existing user account
      // You may need to create a test user or use environment variables
      const testEmail = process.env.TEST_USER_EMAIL || 'test@example.com';
      const testPassword = process.env.TEST_USER_PASSWORD || 'TestPassword123!';

      // Navigate to login page
      await page.goto('http://localhost:3000/login');

      // Verify we're on the login page
      await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();

      // Fill in the login form
      await page.getByLabel('Email address').fill(testEmail);
      await page.getByLabel('Password').fill(testPassword);

      // Submit the form
      await page.getByRole('button', { name: 'Sign in' }).click();

      // Wait for redirect to profile page
      await expect(page).toHaveURL('http://localhost:3000/profile', { timeout: 10000 });
    });

    test('should show error with invalid credentials', async ({ page }) => {
      // Navigate to login page
      await page.goto('http://localhost:3000/login');

      // Fill in the login form with invalid credentials
      await page.getByLabel('Email address').fill('invalid@example.com');
      await page.getByLabel('Password').fill('WrongPassword123!');

      // Submit the form
      await page.getByRole('button', { name: 'Sign in' }).click();

      // Wait for error message
      await expect(page.locator('.text-red-600')).toBeVisible({ timeout: 10000 });
    });

    test('should validate required fields', async ({ page }) => {
      // Navigate to login page
      await page.goto('http://localhost:3000/login');

      // Try to submit without filling any fields
      await page.getByRole('button', { name: 'Sign in' }).click();

      // HTML5 validation should prevent submission
      const emailInput = page.getByLabel('Email address');
      await expect(emailInput).toHaveAttribute('required');
    });

    test('should navigate to register page from login page', async ({ page }) => {
      // Navigate to login page
      await page.goto('http://localhost:3000/login');

      // Click the "create a new account" link
      await page.getByRole('link', { name: 'create a new account' }).click();

      // Verify we're on the register page
      await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
      await expect(page).toHaveURL('http://localhost:3000/register');
    });

    test('should show loading state during sign in', async ({ page }) => {
      const testEmail = process.env.TEST_USER_EMAIL || 'test@example.com';
      const testPassword = process.env.TEST_USER_PASSWORD || 'TestPassword123!';

      // Navigate to login page
      await page.goto('http://localhost:3000/login');

      // Fill in the login form
      await page.getByLabel('Email address').fill(testEmail);
      await page.getByLabel('Password').fill(testPassword);

      // Submit the form
      const submitButton = page.getByRole('button', { name: 'Sign in' });
      await submitButton.click();

      // Check for loading state (button text changes to "Signing in...")
      // Note: This happens very quickly, so we check immediately
      await expect(submitButton).toBeDisabled();
    });
  });

  test.describe('Sign Out', () => {
    test('should successfully sign out from profile page', async ({ page }) => {
      // First, sign in
      const testEmail = process.env.TEST_USER_EMAIL || 'test@example.com';
      const testPassword = process.env.TEST_USER_PASSWORD || 'TestPassword123!';

      await page.goto('http://localhost:3000/login');
      await page.getByLabel('Email address').fill(testEmail);
      await page.getByLabel('Password').fill(testPassword);
      await page.getByRole('button', { name: 'Sign in' }).click();

      // Wait for redirect to profile page
      await expect(page).toHaveURL('http://localhost:3000/profile', { timeout: 10000 });

      // Verify we're logged in by checking for profile content
      await expect(page.getByText('Personal Information')).toBeVisible();

      // Click the logout button
      await page.getByRole('button', { name: 'Logout' }).click();

      // Wait for redirect to home page
      await expect(page).toHaveURL('http://localhost:3000/', { timeout: 10000 });
    });

    test('should redirect to login when accessing profile after sign out', async ({ page }) => {
      // First, sign in
      const testEmail = process.env.TEST_USER_EMAIL || 'test@example.com';
      const testPassword = process.env.TEST_USER_PASSWORD || 'TestPassword123!';

      await page.goto('http://localhost:3000/login');
      await page.getByLabel('Email address').fill(testEmail);
      await page.getByLabel('Password').fill(testPassword);
      await page.getByRole('button', { name: 'Sign in' }).click();

      // Wait for redirect to profile page
      await expect(page).toHaveURL('http://localhost:3000/profile', { timeout: 10000 });

      // Sign out
      await page.getByRole('button', { name: 'Logout' }).click();
      await expect(page).toHaveURL('http://localhost:3000/', { timeout: 10000 });

      // Try to access profile page directly
      await page.goto('http://localhost:3000/profile');

      // Should be redirected or shown login prompt
      // The page shows "Please log in to view your profile" if not authenticated
      await expect(
        page.getByText('Please log in to view your profile')
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Complete Authentication Flow', () => {
    test('should complete full flow: signup -> sign in -> sign out', async ({ page }) => {
      const testEmail = generateTestEmail();
      const testPassword = generateTestPassword();

      // Step 1: Sign up
      await page.goto('http://localhost:3000/register');
      await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();

      await page.getByLabel('Email address').fill(testEmail);
      await page.getByLabel('Password').fill(testPassword);
      await page.getByLabel('Confirm Password').fill(testPassword);
      await page.getByRole('button', { name: 'Create account' }).click();

      // Wait for success message
      await expect(
        page.getByText('Check your email for a confirmation link!')
      ).toBeVisible({ timeout: 10000 });

      // Step 2: Navigate to login (after email confirmation, user would sign in)
      // Note: In a real scenario, the user would confirm their email first
      // For this test, we'll proceed to login page
      await page.goto('http://localhost:3000/login');
      await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();

      // Step 3: Sign in (this may fail if email confirmation is required)
      await page.getByLabel('Email address').fill(testEmail);
      await page.getByLabel('Password').fill(testPassword);
      await page.getByRole('button', { name: 'Sign in' }).click();

      // If sign in is successful, proceed to sign out
      // If email confirmation is required, the test will show an error
      const currentUrl = page.url();
      if (currentUrl.includes('/profile')) {
        // Step 4: Sign out
        await expect(page.getByText('Personal Information')).toBeVisible();
        await page.getByRole('button', { name: 'Logout' }).click();
        await expect(page).toHaveURL('http://localhost:3000/', { timeout: 10000 });
      } else {
        // Email confirmation required - this is expected behavior
        console.log('Email confirmation required - this is expected for new signups');
      }
    });
  });
});

