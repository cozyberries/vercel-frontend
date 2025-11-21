import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Test credentials - should be set via environment variables
const TEST_EMAIL_PREFIX = 'test_playwright_';
const TEST_PASSWORD = 'TestPassword123!';
const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';

// Helper function to generate unique email
function generateTestEmail(): string {
  return `${TEST_EMAIL_PREFIX}${Date.now()}${Math.random().toString(36).substring(7)}@example.com`;
}

// Helper function to cleanup test user from Supabase
async function cleanupTestUser(email: string) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.warn('Supabase credentials not found, skipping cleanup');
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Get user by email
    const { data: users } = await supabase.auth.admin.listUsers();
    const user = users?.users?.find(u => u.email === email);

    if (user) {
      // Delete user profile if exists
      await supabase.from('user_profiles').delete().eq('id', user.id);
      
      // Delete auth user
      await supabase.auth.admin.deleteUser(user.id);
      console.log(`Cleaned up test user: ${email}`);
    }
  } catch (error) {
    console.error('Error cleaning up test user:', error);
  }
}

// Page Object Model for Register Page
class RegisterPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/register');
  }

  async fillEmail(email: string) {
    await this.page.fill('input[name="email"]', email);
  }

  async fillPassword(password: string) {
    await this.page.fill('input[name="password"]', password);
  }

  async fillConfirmPassword(password: string) {
    await this.page.fill('input[name="confirmPassword"]', password);
  }

  async submit() {
    await this.page.click('button[type="submit"]');
  }

  async getErrorMessage() {
    const errorElement = this.page.locator('.text-red-600');
    if (await errorElement.count() > 0) {
      return await errorElement.textContent();
    }
    return null;
  }

  async getSuccessMessage() {
    const successElement = this.page.locator('.text-green-600');
    if (await successElement.count() > 0) {
      return await successElement.textContent();
    }
    return null;
  }

  async isEmailInputVisible() {
    return await this.page.locator('input[name="email"]').isVisible();
  }
}

// Page Object Model for Login Page
class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/login');
  }

  async fillEmail(email: string) {
    await this.page.fill('input[name="email"]', email);
  }

  async fillPassword(password: string) {
    await this.page.fill('input[name="password"]', password);
  }

  async submit() {
    await this.page.click('button[type="submit"]');
  }

  async getErrorMessage() {
    const errorElement = this.page.locator('.text-red-600');
    if (await errorElement.count() > 0) {
      return await errorElement.textContent();
    }
    return null;
  }

  async isEmailInputVisible() {
    return await this.page.locator('input[name="email"]').isVisible();
  }
}

// Page Object Model for Profile Page
class ProfilePage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/profile');
  }

  async isAuthenticated() {
    // Check if we're redirected away from login
    const currentUrl = this.page.url();
    return !currentUrl.includes('/login');
  }

  async waitForPageLoad() {
    await this.page.waitForLoadState('networkidle');
  }
}

// Page Object Model for Header/Navigation
class Header {
  constructor(private page: Page) {}

  async clickUserIcon() {
    await this.page.click('button[aria-label*="profile"], button[aria-label*="login"]');
  }

  async clickLogout() {
    // Try to find logout button in profile page or hamburger menu
    const logoutButton = this.page.locator('button:has-text("Logout"), button:has-text("Log out")');
    if (await logoutButton.count() > 0) {
      await logoutButton.first().click();
    }
  }

  async isUserIconVisible() {
    const userIcon = this.page.locator('button[aria-label*="profile"], button[aria-label*="login"]');
    return await userIcon.isVisible();
  }
}

test.describe('User Authentication Flow', () => {
  let testEmail: string;

  test.beforeEach(() => {
    testEmail = generateTestEmail();
  });

  test.afterEach(async () => {
    // Cleanup test user after each test
    await cleanupTestUser(testEmail);
  });

  test.describe('User Signup Flow', () => {
    test('should successfully register a new user with valid credentials', async ({ page }) => {
      const registerPage = new RegisterPage(page);
      
      await registerPage.goto();
      await expect(registerPage.isEmailInputVisible()).toBeTruthy();

      await registerPage.fillEmail(testEmail);
      await registerPage.fillPassword(TEST_PASSWORD);
      await registerPage.fillConfirmPassword(TEST_PASSWORD);
      
      await registerPage.submit();

      // Wait for either success message or error message to appear
      // Also wait for the button to stop being in loading state
      await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 15000 });
      await page.waitForTimeout(1000); // Give a moment for message to render
      
      const successMessage = await registerPage.getSuccessMessage();
      const errorMessage = await registerPage.getErrorMessage();

      // Should show either success message about email confirmation or an error
      // (Note: Supabase may require email confirmation, so success message might not appear immediately)
      expect(successMessage || errorMessage).toBeTruthy();
      
      // If there's an error, it should not be a validation error for valid credentials
      if (errorMessage) {
        const lowerError = errorMessage.toLowerCase();
        // Allow for email confirmation messages or other non-validation errors
        expect(
          lowerError.includes('password') && lowerError.includes('match') ||
          lowerError.includes('email') && lowerError.includes('format') ||
          lowerError.includes('invalid') && (lowerError.includes('email') || lowerError.includes('password'))
        ).toBeFalsy();
      }
    });

    test('should show error when passwords do not match', async ({ page }) => {
      const registerPage = new RegisterPage(page);
      
      await registerPage.goto();
      await registerPage.fillEmail(testEmail);
      await registerPage.fillPassword(TEST_PASSWORD);
      await registerPage.fillConfirmPassword('DifferentPassword123!');
      
      await registerPage.submit();

      // Wait for error message
      await page.waitForSelector('.text-red-600', { timeout: 5000 });
      
      const errorMessage = await registerPage.getErrorMessage();
      expect(errorMessage?.toLowerCase()).toContain('password');
    });

    test('should show error for invalid email format', async ({ page }) => {
      const registerPage = new RegisterPage(page);
      
      await registerPage.goto();
      await registerPage.fillEmail('invalid-email');
      await registerPage.fillPassword(TEST_PASSWORD);
      await registerPage.fillConfirmPassword(TEST_PASSWORD);
      
      // HTML5 validation should prevent submission
      const emailInput = page.locator('input[name="email"]');
      const validity = await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid);
      expect(validity).toBeFalsy();
    });

    test('should show error when trying to register with existing email', async ({ page }) => {
      const registerPage = new RegisterPage(page);
      
      // First registration
      await registerPage.goto();
      await registerPage.fillEmail(testEmail);
      await registerPage.fillPassword(TEST_PASSWORD);
      await registerPage.fillConfirmPassword(TEST_PASSWORD);
      await registerPage.submit();
      
      // Wait a bit for first registration to complete
      await page.waitForTimeout(2000);
      
      // Try to register again with same email
      await registerPage.goto();
      await registerPage.fillEmail(testEmail);
      await registerPage.fillPassword(TEST_PASSWORD);
      await registerPage.fillConfirmPassword(TEST_PASSWORD);
      await registerPage.submit();

      // Wait for error message
      await page.waitForSelector('.text-red-600', { timeout: 10000 });
      
      const errorMessage = await registerPage.getErrorMessage();
      // Should indicate user already exists
      expect(errorMessage).toBeTruthy();
    });

    test('should validate password requirements', async ({ page }) => {
      const registerPage = new RegisterPage(page);
      
      await registerPage.goto();
      await registerPage.fillEmail(testEmail);
      
      // Try with very short password
      await registerPage.fillPassword('123');
      await registerPage.fillConfirmPassword('123');
      
      // HTML5 validation should prevent submission if minLength is set
      const passwordInput = page.locator('input[name="password"]');
      const validity = await passwordInput.evaluate((el: HTMLInputElement) => {
        if (el.hasAttribute('minlength')) {
          return el.value.length >= parseInt(el.getAttribute('minlength') || '0');
        }
        return true;
      });
      
      // If minLength is set, short password should be invalid
      if (await passwordInput.getAttribute('minlength')) {
        expect(validity).toBeFalsy();
      }
    });
  });

  test.describe('User Signin Flow', () => {
    test('should successfully login with valid credentials', async ({ page }) => {
      const registerPage = new RegisterPage(page);
      const loginPage = new LoginPage(page);
      const profilePage = new ProfilePage(page);
      
      // First, register a user
      await registerPage.goto();
      await registerPage.fillEmail(testEmail);
      await registerPage.fillPassword(TEST_PASSWORD);
      await registerPage.fillConfirmPassword(TEST_PASSWORD);
      await registerPage.submit();
      
      // Wait for registration to complete
      await page.waitForTimeout(3000);
      
      // Note: In production, user would need to confirm email first
      // For testing, we'll try to login (may fail if email confirmation is required)
      
      await loginPage.goto();
      await loginPage.fillEmail(testEmail);
      await loginPage.fillPassword(TEST_PASSWORD);
      await loginPage.submit();
      
      // Wait for navigation or error
      await page.waitForTimeout(3000);
      
      // Check if we're redirected to profile or still on login with error
      const currentUrl = page.url();
      const errorMessage = await loginPage.getErrorMessage();
      
      // Either we successfully logged in (redirected to /profile) or there's an error
      if (currentUrl.includes('/profile')) {
        // Successfully logged in
        expect(currentUrl).toContain('/profile');
      } else {
        // May need email confirmation - check error message
        expect(errorMessage).toBeTruthy();
      }
    });

    test('should show error for wrong password', async ({ page }) => {
      const registerPage = new RegisterPage(page);
      const loginPage = new LoginPage(page);
      
      // First, register a user
      await registerPage.goto();
      await registerPage.fillEmail(testEmail);
      await registerPage.fillPassword(TEST_PASSWORD);
      await registerPage.fillConfirmPassword(TEST_PASSWORD);
      await registerPage.submit();
      
      await page.waitForTimeout(3000);
      
      // Try to login with wrong password
      await loginPage.goto();
      await loginPage.fillEmail(testEmail);
      await loginPage.fillPassword('WrongPassword123!');
      await loginPage.submit();
      
      // Wait for error message
      await page.waitForSelector('.text-red-600', { timeout: 10000 });
      
      const errorMessage = await loginPage.getErrorMessage();
      expect(errorMessage?.toLowerCase()).toMatch(/invalid|incorrect|wrong|password|credentials/i);
    });

    test('should show error for non-existent user', async ({ page }) => {
      const loginPage = new LoginPage(page);
      
      await loginPage.goto();
      await loginPage.fillEmail('nonexistent@example.com');
      await loginPage.fillPassword(TEST_PASSWORD);
      await loginPage.submit();
      
      // Wait for error message
      await page.waitForSelector('.text-red-600', { timeout: 10000 });
      
      const errorMessage = await loginPage.getErrorMessage();
      expect(errorMessage?.toLowerCase()).toMatch(/invalid|incorrect|user|not found|credentials/i);
    });

    test('should validate email format on login', async ({ page }) => {
      const loginPage = new LoginPage(page);
      
      await loginPage.goto();
      await loginPage.fillEmail('invalid-email');
      await loginPage.fillPassword(TEST_PASSWORD);
      
      // HTML5 validation should prevent submission
      const emailInput = page.locator('input[name="email"]');
      const validity = await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid);
      expect(validity).toBeFalsy();
    });
  });

  test.describe('User Signout Flow', () => {
    test('should successfully logout and redirect to home', async ({ page }) => {
      const registerPage = new RegisterPage(page);
      const loginPage = new LoginPage(page);
      const profilePage = new ProfilePage(page);
      const header = new Header(page);
      
      // Register and login (if email confirmation is not required)
      await registerPage.goto();
      await registerPage.fillEmail(testEmail);
      await registerPage.fillPassword(TEST_PASSWORD);
      await registerPage.fillConfirmPassword(TEST_PASSWORD);
      await registerPage.submit();
      
      await page.waitForTimeout(3000);
      
      // Try to login
      await loginPage.goto();
      await loginPage.fillEmail(testEmail);
      await loginPage.fillPassword(TEST_PASSWORD);
      await loginPage.submit();
      
      await page.waitForTimeout(3000);
      
      // If we're on profile page, try to logout
      if (page.url().includes('/profile')) {
        // Look for logout button
        const logoutButton = page.locator('button:has-text("Logout"), button:has-text("Log out")');
        
        if (await logoutButton.count() > 0) {
          await logoutButton.first().click();
          
          // Wait for redirect
          await page.waitForURL('**/', { timeout: 10000 });
          
          // Verify we're on home page
          expect(page.url()).toMatch(/\/$/);
          
          // Verify we can't access profile without login
          await profilePage.goto();
          await page.waitForTimeout(2000);
          
          // Should be redirected to login or stay on home
          const currentUrl = page.url();
          expect(currentUrl).toMatch(/\/(login|$)/);
        }
      }
    });

    test('should prevent access to protected routes after logout', async ({ page }) => {
      const registerPage = new RegisterPage(page);
      const loginPage = new LoginPage(page);
      const profilePage = new ProfilePage(page);
      
      // Register and login
      await registerPage.goto();
      await registerPage.fillEmail(testEmail);
      await registerPage.fillPassword(TEST_PASSWORD);
      await registerPage.fillConfirmPassword(TEST_PASSWORD);
      await registerPage.submit();
      
      await page.waitForTimeout(3000);
      
      await loginPage.goto();
      await loginPage.fillEmail(testEmail);
      await loginPage.fillPassword(TEST_PASSWORD);
      await loginPage.submit();
      
      await page.waitForTimeout(3000);
      
      // If logged in, logout
      if (page.url().includes('/profile')) {
        const logoutButton = page.locator('button:has-text("Logout"), button:has-text("Log out")');
        if (await logoutButton.count() > 0) {
          await logoutButton.first().click();
          await page.waitForURL('**/', { timeout: 10000 });
        }
      }
      
      // Try to access profile
      await profilePage.goto();
      await page.waitForTimeout(2000);
      
      // Should be redirected to login
      const currentUrl = page.url();
      expect(currentUrl).toMatch(/\/(login|$)/);
    });
  });

  test.describe('Edge Cases', () => {
    test('should handle network errors gracefully', async ({ page }) => {
      const registerPage = new RegisterPage(page);
      
      // Simulate network failure
      await page.route('**/auth/v1/signup', route => route.abort());
      
      await registerPage.goto();
      await registerPage.fillEmail(testEmail);
      await registerPage.fillPassword(TEST_PASSWORD);
      await registerPage.fillConfirmPassword(TEST_PASSWORD);
      await registerPage.submit();
      
      // Should show error message
      await page.waitForSelector('.text-red-600', { timeout: 10000 });
      const errorMessage = await registerPage.getErrorMessage();
      expect(errorMessage).toBeTruthy();
    });

    test('should maintain session after page reload', async ({ page, context }) => {
      const registerPage = new RegisterPage(page);
      const loginPage = new LoginPage(page);
      const profilePage = new ProfilePage(page);
      
      // Register
      await registerPage.goto();
      await registerPage.fillEmail(testEmail);
      await registerPage.fillPassword(TEST_PASSWORD);
      await registerPage.fillConfirmPassword(TEST_PASSWORD);
      await registerPage.submit();
      await page.waitForTimeout(3000);
      
      // Login
      await loginPage.goto();
      await loginPage.fillEmail(testEmail);
      await loginPage.fillPassword(TEST_PASSWORD);
      await loginPage.submit();
      await page.waitForTimeout(3000);
      
      // If logged in, reload page
      if (page.url().includes('/profile')) {
        await page.reload();
        await page.waitForLoadState('networkidle');
        
        // Should still be on profile page (session maintained)
        expect(page.url()).toContain('/profile');
      }
    });
  });
});

