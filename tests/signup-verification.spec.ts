import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * Signup Verification Tests
 * 
 * These tests verify that signup actually creates users in the database
 * and that user profiles are properly created.
 */

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';

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

  test.afterEach(async () => {
    // Clean up: Delete test users created during tests
    if (adminSupabase) {
      // This will be handled in individual tests
    }
  });

  test('should create user in auth.users table after signup', async ({ page }) => {
    test.skip(!adminSupabase, 'Supabase credentials not configured');

    // Generate unique email
    const timestamp = Date.now();
    const testEmail = `test-signup-verify-${timestamp}@example.com`;

    // Step 1: Navigate to signup page
    await page.goto(`${BASE_URL}/register`);

    // Step 2: Fill in signup form
    await page.getByLabel(/Email address/i).fill(testEmail);
    await page.getByLabel(/^Password$/i).first().fill(testPassword);
    await page.getByLabel(/Confirm Password/i).fill(testPassword);

    // Step 3: Submit the form
    await page.getByRole('button', { name: /Create account/i }).click();

    // Step 4: Wait for signup to complete (either success message or error)
    await page.waitForTimeout(3000);

    // Step 5: Verify user was created in auth.users
    const { data: authUsers, error: listError } = await adminSupabase!.auth.admin.listUsers();

    expect(listError).toBeNull();
    expect(authUsers).toBeTruthy();

    // Find the user we just created
    const createdUser = authUsers.users.find((user) => user.email === testEmail);

    expect(createdUser).toBeTruthy();
    expect(createdUser?.email).toBe(testEmail);
    expect(createdUser?.id).toBeTruthy();

    console.log(`✅ User created in auth.users: ${createdUser?.id}`);

    // Clean up: Delete the test user
    if (createdUser) {
      await adminSupabase!.auth.admin.deleteUser(createdUser.id);
      console.log(`🧹 Cleaned up test user: ${testEmail}`);
    }
  });

  test('should create user profile in user_profiles table after signup', async ({ page }) => {
    test.skip(!adminSupabase, 'Supabase credentials not configured');

    // Generate unique email
    const timestamp = Date.now();
    const testEmail = `test-profile-verify-${timestamp}@example.com`;

    // Step 1: Navigate to signup page
    await page.goto(`${BASE_URL}/register`);

    // Step 2: Fill in signup form
    await page.getByLabel(/Email address/i).fill(testEmail);
    await page.getByLabel(/^Password$/i).first().fill(testPassword);
    await page.getByLabel(/Confirm Password/i).fill(testPassword);

    // Step 3: Submit the form
    await page.getByRole('button', { name: /Create account/i }).click();

    // Step 4: Wait for signup to complete
    await page.waitForTimeout(3000);

    // Step 5: Get the created user from auth.users
    const { data: authUsers } = await adminSupabase!.auth.admin.listUsers();
    const createdUser = authUsers.users.find((user) => user.email === testEmail);

    expect(createdUser).toBeTruthy();

    if (!createdUser) {
      throw new Error('User not found in auth.users');
    }

    // Step 6: Verify user profile exists in user_profiles table
    const { data: profile, error: profileError } = await adminSupabase!
      .from('user_profiles')
      .select('*')
      .eq('id', createdUser.id)
      .single();

    if (profileError) {
      console.error('Profile error:', profileError);
      // If profile doesn't exist, that's the bug we're testing for
      expect(profileError.code).not.toBe('PGRST116'); // PGRST116 = not found
    }

    expect(profile).toBeTruthy();
    expect(profile?.id).toBe(createdUser.id);
    expect(profile?.role).toBe('customer');
    expect(profile?.is_active).toBe(true);

    console.log(`✅ User profile created:`, {
      id: profile?.id,
      role: profile?.role,
      is_active: profile?.is_active,
      is_verified: profile?.is_verified,
    });

    // Clean up: Delete the test user
    await adminSupabase!.auth.admin.deleteUser(createdUser.id);
    console.log(`🧹 Cleaned up test user: ${testEmail}`);
  });

  test('should verify signup flow end-to-end', async ({ page }) => {
    test.skip(!adminSupabase, 'Supabase credentials not configured');

    // Generate unique email
    const timestamp = Date.now();
    const testEmail = `test-e2e-${timestamp}@example.com`;

    // Step 1: Navigate to signup page
    await page.goto(`${BASE_URL}/register`);

    // Verify page loaded correctly
    await expect(page.getByRole('heading', { name: /Create your account/i })).toBeVisible();

    // Step 2: Fill in signup form
    await page.getByLabel(/Email address/i).fill(testEmail);
    await page.getByLabel(/^Password$/i).first().fill(testPassword);
    await page.getByLabel(/Confirm Password/i).fill(testPassword);

    // Step 3: Submit the form
    await page.getByRole('button', { name: /Create account/i }).click();

    // Step 4: Wait for response
    await page.waitForTimeout(3000);

    // Step 5: Check for success message or error
    const successMessage = page.getByText(/Check your email for a confirmation link/i);
    const errorMessage = page.locator('text=/error|failed/i').first();

    const hasSuccess = await successMessage.isVisible().catch(() => false);
    const hasError = await errorMessage.isVisible().catch(() => false);

    // Step 6: Verify user was created regardless of email confirmation
    const { data: authUsers } = await adminSupabase!.auth.admin.listUsers();
    const createdUser = authUsers.users.find((user) => user.email === testEmail);

    if (hasError) {
      const errorText = await errorMessage.textContent();
      console.log('❌ Signup error:', errorText);
    }

    // User should be created even if email confirmation is required
    expect(createdUser).toBeTruthy();
    expect(createdUser?.email).toBe(testEmail);

    // Step 7: Verify user profile exists
    if (createdUser) {
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

      // Clean up
      await adminSupabase!.auth.admin.deleteUser(createdUser.id);
      console.log(`🧹 Cleaned up test user: ${testEmail}`);
    }
  });

  test('should verify signup creates profile even with email confirmation required', async ({ page }) => {
    test.skip(!adminSupabase, 'Supabase credentials not configured');

    // Generate unique email
    const timestamp = Date.now();
    const testEmail = `test-confirm-${timestamp}@example.com`;

    // Step 1: Sign up
    await page.goto(`${BASE_URL}/register`);
    await page.getByLabel(/Email address/i).fill(testEmail);
    await page.getByLabel(/^Password$/i).first().fill(testPassword);
    await page.getByLabel(/Confirm Password/i).fill(testPassword);
    await page.getByRole('button', { name: /Create account/i }).click();

    // Wait for signup to process
    await page.waitForTimeout(3000);

    // Step 2: Verify user exists (even if email not confirmed)
    const { data: authUsers } = await adminSupabase!.auth.admin.listUsers();
    const createdUser = authUsers.users.find((user) => user.email === testEmail);

    expect(createdUser).toBeTruthy();

    if (createdUser) {
      // Step 3: Verify profile was created (should happen in callback or immediately)
      // Wait a bit more for profile creation
      await page.waitForTimeout(2000);

      const { data: profile, error: profileError } = await adminSupabase!
        .from('user_profiles')
        .select('*')
        .eq('id', createdUser.id)
        .single();

      if (profileError && profileError.code === 'PGRST116') {
        // Profile not found - this indicates the bug
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

      // Clean up
      await adminSupabase!.auth.admin.deleteUser(createdUser.id);
    }
  });
});




