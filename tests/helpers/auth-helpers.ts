import { Page, expect } from '@playwright/test';

/**
 * Generates a unique test email address
 */
export const generateTestEmail = (): string => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `test-${timestamp}-${random}@example.com`;
};

/**
 * Generates a test password that meets typical requirements
 */
export const generateTestPassword = (): string => {
  return 'TestPassword123!';
};

/**
 * Signs up a new user
 */
export const signUp = async (
  page: Page,
  email: string,
  password: string,
  confirmPassword?: string
): Promise<void> => {
  await page.goto('http://localhost:3000/register');
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();

  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Confirm Password').fill(confirmPassword || password);
  await page.getByRole('button', { name: 'Create account' }).click();
};

/**
 * Signs in an existing user
 */
export const signIn = async (
  page: Page,
  email: string,
  password: string
): Promise<void> => {
  await page.goto('http://localhost:3000/login');
  await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();

  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
};

/**
 * Signs out the current user
 */
export const signOut = async (page: Page): Promise<void> => {
  // Navigate to profile page if not already there
  if (!page.url().includes('/profile')) {
    await page.goto('http://localhost:3000/profile');
  }

  // Wait for profile page to load
  await expect(page.getByText('Personal Information')).toBeVisible({ timeout: 10000 });

  // Click logout button
  await page.getByRole('button', { name: 'Logout' }).click();

  // Wait for redirect to home page
  await expect(page).toHaveURL('http://localhost:3000/', { timeout: 10000 });
};

/**
 * Waits for user to be signed in (checks for profile page)
 */
export const waitForSignIn = async (page: Page): Promise<void> => {
  await expect(page).toHaveURL('http://localhost:3000/profile', { timeout: 10000 });
  await expect(page.getByText('Personal Information')).toBeVisible();
};

/**
 * Gets test credentials from environment variables or uses defaults
 */
export const getTestCredentials = (): { email: string; password: string } => {
  return {
    email: process.env.TEST_USER_EMAIL || 'test@example.com',
    password: process.env.TEST_USER_PASSWORD || 'TestPassword123!',
  };
};

