import { test, expect } from '@playwright/test';

/**
 * Authentication Tests
 *
 * Covers the current phone-first auth UI:
 * - /login        — mobile number sign-in, Google, guest, links to signup/staff sign-in
 * - /login/email  — staff (email + password) sign-in
 * - /signup       — mobile number registration (full name + mobile + optional email)
 * - /login/verify — redirect guard when there is no pending OTP session
 *
 * Phone sign-in sends a REAL OTP SMS. These tests never submit a valid-looking
 * mobile number and never attempt a real login — they only assert rendering,
 * client-side validation, and navigation.
 *
 * Email/password *signup* (formerly /register/email) no longer exists in the
 * product (only /login/email staff sign-in remains), so those tests were
 * deleted rather than rewritten.
 */

test.describe('Login page (/login)', () => {
  test('renders the phone sign-in form', async ({ page }) => {
    await page.goto('/login');

    await expect(page).toHaveTitle(/CozyBerries/i);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByPlaceholder('Enter your mobile number')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue as guest/i })).toBeVisible();
  });

  test('shows a validation error when the mobile number is empty', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    await expect(page.getByText('Phone number is required')).toBeVisible();
  });

  test('shows a validation error for a too-short mobile number', async ({ page }) => {
    await page.goto('/login');

    // Deliberately not a valid-looking number — 3 digits can never pass
    // validation or trigger a real OTP send.
    await page.getByPlaceholder('Enter your mobile number').fill('123');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    await expect(page.getByText('Phone number must be 10 digits')).toBeVisible();
  });

  test('links to the staff sign-in page', async ({ page }) => {
    await page.goto('/login');

    await page
      .getByRole('link', { name: /Sign in with your CozyBerries staff email/i })
      .click();

    await expect(page).toHaveURL(/\/login\/email$/);
    await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible();
  });

  test('links to the signup page', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('link', { name: 'Create an account.' }).click();

    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole('heading', { name: 'Welcome to CozyBerries' })).toBeVisible();
  });

  test('continue as guest returns to the page the visitor came from', async ({ page }) => {
    // Navigate home first so there is a real "previous page" in history —
    // handleGuest() falls back to router.back() when there is no redirect param.
    await page.goto('/');
    await page.goto('/login');

    await page.getByRole('button', { name: /Continue as guest/i }).click();

    await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  });

  test('renders with a redirect param and carries it into the signup link', async ({ page }) => {
    await page.goto('/login?redirect=%2Fcheckout');

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create an account.' })).toHaveAttribute(
      'href',
      '/signup?redirect=%2Fcheckout'
    );
  });
});

test.describe('Login verify guard (/login/verify)', () => {
  test('redirects to /login when there is no pending login', async ({ page }) => {
    await page.goto('/login/verify');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });
});

test.describe('Staff sign-in (/login/email)', () => {
  test('shows an error for invalid credentials', async ({ page }) => {
    await page.goto('/login/email');

    await page.getByLabel(/Email address/i).fill('nonexistent@example.com');
    await page.getByLabel(/^Password$/i).fill('WrongPassword123!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page.getByText('Invalid login credentials')).toBeVisible({ timeout: 10_000 });
  });

  test('flags an invalid email format via HTML5 validation', async ({ page }) => {
    await page.goto('/login/email');

    const emailInput = page.getByLabel(/Email address/i);
    await emailInput.fill('invalid-email');
    await emailInput.blur();

    const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
    expect(isInvalid).toBe(true);
  });

  test('requires the email field', async ({ page }) => {
    await page.goto('/login/email');

    await expect(page.getByLabel(/Email address/i)).toHaveAttribute('required', '');
  });

  test('requires the password field', async ({ page }) => {
    await page.goto('/login/email');

    await expect(page.getByLabel(/^Password$/i)).toHaveAttribute('required', '');
  });

  test('shows a loading state while signing in', async ({ page }) => {
    await page.goto('/login/email');

    // Delay the auth request so the loading state is observable.
    await page.route(/auth/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });

    await page.getByLabel(/Email address/i).fill('test@example.com');
    await page.getByLabel(/^Password$/i).fill('TestPassword123!');
    void page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page.getByRole('button', { name: /Signing in/i })).toBeVisible({
      timeout: 10_000,
    });

    await page.unrouteAll();
  });

  test('disables the submit button while signing in', async ({ page }) => {
    await page.goto('/login/email');

    await page.route(/auth/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });

    await page.getByLabel(/Email address/i).fill('test@example.com');
    await page.getByLabel(/^Password$/i).fill('TestPassword123!');
    void page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page.getByRole('button', { name: /Signing in/i })).toBeDisabled({
      timeout: 10_000,
    });

    await page.unrouteAll();
  });

  test('links back to the phone sign-in page', async ({ page }) => {
    await page.goto('/login/email');

    await page.getByRole('link', { name: /Go back to sign in/i }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });
});

test.describe('Signup page (/signup)', () => {
  test('renders the phone signup form', async ({ page }) => {
    await page.goto('/signup');

    await expect(page.getByRole('heading', { name: 'Welcome to CozyBerries' })).toBeVisible();
    await expect(page.getByPlaceholder('Enter your full name')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your mobile number')).toBeVisible();
    await expect(page.getByPlaceholder('For order updates & invoices')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue as guest/i })).toBeVisible();
  });

  test('shows a validation error when the full name is empty', async ({ page }) => {
    await page.goto('/signup');

    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    await expect(page.getByText('Full name is required')).toBeVisible();
  });

  test('shows a validation error when the mobile number is empty', async ({ page }) => {
    await page.goto('/signup');

    await page.getByPlaceholder('Enter your full name').fill('Test User');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    await expect(page.getByText('Phone number is required')).toBeVisible();
  });

  test('shows a validation error for a too-short mobile number', async ({ page }) => {
    await page.goto('/signup');

    await page.getByPlaceholder('Enter your full name').fill('Test User');
    // Deliberately not a valid-looking number — never triggers a real OTP send.
    await page.getByPlaceholder('Enter your mobile number').fill('123');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    await expect(page.getByText('Phone number must be 10 digits')).toBeVisible();
  });

  test('the optional email field is not required', async ({ page }) => {
    await page.goto('/signup');

    const emailInput = page.getByPlaceholder('For order updates & invoices');
    await expect(emailInput).toHaveAttribute('type', 'email');
    expect(await emailInput.getAttribute('required')).toBeNull();
  });

  test('links to the login page', async ({ page }) => {
    await page.goto('/signup');

    await page.getByRole('link', { name: 'Sign in.' }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });
});
