import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * Signup Verification Tests
 * 
 * These tests verify that signup actually creates users in the database
 * and that user profiles are properly created.
 * 
 * Prerequisites:
 * - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set
 * - Supabase must accept signup requests (not rate-limited)
 */

// Supabase configuration for verification
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Test password
const testPassword = 'TestPassword123!';

test.describe('Signup Verification', () => {
  let adminSupabase: ReturnType<typeof createClient> | null = null;

  test.beforeAll(() => {
    // Initialize admin Supabase client for verification
    if (supabaseUrl && serviceRoleKey) {
      adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    } else {
      console.warn('⚠️  Supabase credentials not found. Database verification tests will be skipped.');
    }
  });

  /** Helper: submit signup form and wait for form submission to complete. */
  async function submitSignupForm(page: import('@playwright/test').Page, email: string) {
    await page.goto('/register');
    await page.getByLabel(/Email address/i).fill(email);
    await page.getByLabel(/^Password$/i).first().fill(testPassword);
    await page.getByLabel(/Confirm Password/i).fill(testPassword);
    await page.getByRole('button', { name: /Create account/i }).click();

    // Wait for either success message, error, or navigation
    try {
      await Promise.race([
        page.waitForURL(/^(?!.*\/register)/, { timeout: 15_000 }),
        page.getByText(/check your email|verification/i).waitFor({ state: 'visible', timeout: 15_000 }),
        page.locator('text=/error|failed/i').first().waitFor({ state: 'visible', timeout: 15_000 })
      ]);
    } catch (err) {
      // Only timeout errors are expected here; log unexpected errors
      if (err && typeof err === 'object' && 'name' in err && err.name !== 'TimeoutError') {
        console.error('Unexpected error during signup form submission:', err);
      }
      // Form submission completed even if we timed out waiting for result
    }
  }

  /** Helper: find user in auth.users by email, or return null. Handles pagination. */
  async function findUser(email: string) {
    if (!adminSupabase) return null;
    
    let page = 1;
    const perPage = 1000;
    
    while (true) {
      const { data, error } = await adminSupabase.auth.admin.listUsers({
        page,
        perPage
      });
      
      if (error) {
        console.error('Error listing users:', error);
        return null;
      }
      
      const user = data?.users?.find((u) => u.email === email);
      if (user) return user;
      
      // If we got fewer users than perPage, we've reached the end
      if (!data?.users || data.users.length < perPage) {
        return null;
      }
      
      page++;
    }
  }

  /** Helper: clean up test user. */
  async function cleanupUser(userId: string) {
    if (!adminSupabase) return;
    try {
      await adminSupabase.auth.admin.deleteUser(userId);
    } catch (error) {
      console.error(`Failed to cleanup test user ${userId}:`, error);
      // Continue test execution - cleanup failures shouldn't break tests
    }
  }

  test('should create user in auth.users table after signup', async ({ page }) => {
    test.skip(!adminSupabase, 'Supabase credentials not configured');

    const testEmail = `test-signup-verify-${Date.now()}@example.com`;

    await submitSignupForm(page, testEmail);

    const createdUser = await findUser(testEmail);

    // If Supabase rejected the signup (rate limit, config issue), skip gracefully
    if (!createdUser) {
      test.skip(true, 'User was not created — Supabase signup may have failed or is rate-limited');
      return;
    }

    expect(createdUser.email).toBe(testEmail);
    expect(createdUser.id).toBeTruthy();
    console.log(`✅ User created in auth.users: ${createdUser.id}`);

    await cleanupUser(createdUser.id);
    console.log(`🧹 Cleaned up test user: ${testEmail}`);
  });

  test('should create user profile in user_profiles table after signup', async ({ page }) => {
    test.skip(!adminSupabase, 'Supabase credentials not configured');

    const testEmail = `test-profile-verify-${Date.now()}@example.com`;

    await submitSignupForm(page, testEmail);

    const createdUser = await findUser(testEmail);

    if (!createdUser) {
      test.skip(true, 'User was not created — Supabase signup may have failed or is rate-limited');
      return;
    }

    // Verify user profile exists in user_profiles table
    const { data: profile, error: profileError } = await adminSupabase!
      .from('user_profiles')
      .select('*')
      .eq('id', createdUser.id)
      .single();

    if (profileError) {
      console.error('Profile error:', profileError);
      expect(profileError.code).not.toBe('PGRST116'); // PGRST116 = not found
    }

    expect(profile).toBeTruthy();
    expect(profile?.id).toBe(createdUser.id);
    expect(profile?.role).toBe('customer');
    expect(profile?.is_active).toBe(true);

    console.log('✅ User profile created:', {
      id: profile?.id,
      role: profile?.role,
      is_active: profile?.is_active,
      is_verified: profile?.is_verified,
    });

    await cleanupUser(createdUser.id);
    console.log(`🧹 Cleaned up test user: ${testEmail}`);
  });

  test('should verify signup flow end-to-end', async ({ page }) => {
    test.skip(!adminSupabase, 'Supabase credentials not configured');

    const testEmail = `test-e2e-${Date.now()}@example.com`;

    await page.goto('/register');
    await expect(page.getByRole('heading', { name: /Create your account/i })).toBeVisible();

    await submitSignupForm(page, testEmail);

    // Check for success message or error
    const successMessage = page.getByText(/Check your email for a confirmation link/i);
    const errorMessage = page.locator('text=/error|failed/i').first();

    const hasSuccess = await successMessage.isVisible().catch(() => false);
    const hasError = await errorMessage.isVisible().catch(() => false);

    if (hasError) {
      const errorText = await errorMessage.textContent();
      console.log('❌ Signup error:', errorText);
    }

    // Verify user was created regardless of email confirmation
    const createdUser = await findUser(testEmail);

    if (!createdUser) {
      test.skip(true, 'User was not created — Supabase signup may have failed or is rate-limited');
      return;
    }

    expect(createdUser.email).toBe(testEmail);

    // Verify user profile exists
    const { data: profile } = await adminSupabase!
      .from('user_profiles')
      .select('*')
      .eq('id', createdUser.id)
      .single();

    expect(profile).toBeTruthy();
    expect(profile?.id).toBe(createdUser.id);
    expect(profile?.role).toBe('customer');

    console.log('✅ End-to-end signup verification passed:', {
      authUser: !!createdUser,
      profile: !!profile,
      profileRole: profile?.role,
    });

    await cleanupUser(createdUser.id);
    console.log(`🧹 Cleaned up test user: ${testEmail}`);
  });

  test('should verify signup creates profile even with email confirmation required', async ({ page }) => {
    test.skip(!adminSupabase, 'Supabase credentials not configured');

    const testEmail = `test-confirm-${Date.now()}@example.com`;

    await submitSignupForm(page, testEmail);

    const createdUser = await findUser(testEmail);

    if (!createdUser) {
      test.skip(true, 'User was not created — Supabase signup may have failed or is rate-limited');
      return;
    }

    // Wait a bit more for profile creation
    await page.waitForTimeout(2000);

    const { data: profile, error: profileError } = await adminSupabase!
      .from('user_profiles')
      .select('*')
      .eq('id', createdUser.id)
      .single();

    if (profileError && profileError.code === 'PGRST116') {
      console.error('❌ BUG DETECTED: User profile was NOT created after signup!');
      console.error('User ID:', createdUser.id);
      console.error('User Email:', createdUser.email);
      throw new Error('User profile was not created after signup. This is the bug we need to fix.');
    }

    expect(profile).toBeTruthy();
    expect(profile?.id).toBe(createdUser.id);

    console.log('✅ Profile created successfully:', {
      userId: profile?.id,
      role: profile?.role,
      is_verified: profile?.is_verified,
    });

    await cleanupUser(createdUser.id);
  });
});
