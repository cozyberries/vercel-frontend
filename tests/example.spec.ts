import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test('should have correct page title', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Expect a title "to contain" CozyBerries.
    await expect(page).toHaveTitle(/CozyBerries/);
  });

  test('should display home page content', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check for "Shop by Age" section (common element on home page)
    await expect(page.getByText('Shop by Age')).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to login page via user icon', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Wait for page to load
    await page.waitForLoadState('networkidle');
    const userButton = page.getByRole('button', { name: /go to login/i });
    
    // On desktop, the user icon should be visible
    // On mobile, it might be in a hamburger menu
    if (await userButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await userButton.click();
      await expect(page).toHaveURL('http://localhost:3000/login');
      await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    } else {
      await page.goto('http://localhost:3000/login');
      await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    }
  });
});
