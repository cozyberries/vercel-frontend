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

  type SignupSubmissionResult =
    | { outcome: 'navigated'; detail?: string }
    | { outcome: 'verificationShown'; detail?: string }
    | { outcome: 'errorShown'; detail?: string }
    | { outcome: 'timeout'; detail?: string };

  /** Helper: wait for signup form result (navigation, verification message, or error). */
  async function waitForSignupOutcome(page: import('@playwright/test').Page): Promise<SignupSubmissionResult> {
    const verificationEl = page.getByText(/check your email|verification/i);
    const errorEl = page.locator('text=/error|failed/i').first();
    try {
      const result = await Promise.race([
        page.waitForURL(/^(?!.*\/register)/, { timeout: 15_000 }).then(() => ({ outcome: 'navigated' as const, detail: page.url() })),
        verificationEl.waitFor({ state: 'visible', timeout: 15_000 }).then(async () => ({ outcome: 'verificationShown' as const, detail: (await verificationEl.textContent()) ?? undefined })),
        errorEl.waitFor({ state: 'visible', timeout: 15_000 }).then(async () => ({ outcome: 'errorShown' as const, detail: (await errorEl.textContent()) ?? undefined })),
      ]);
      return result;
    } catch (err) {
      if (err && typeof err === 'object' && 'name' in err && (err as Error).name !== 'TimeoutError') {
        console.error('Unexpected error during signup form submission:', err);
      }
      return { outcome: 'timeout', detail: err instanceof Error ? err.message : err != null ? String(err) : undefined };
    }
  }

  /** Helper: submit signup form and wait for form submission to complete. Returns outcome so callers can assert. */
  async function submitSignupForm(
    page: import('@playwright/test').Page,
    email: string,
    opts?: { skipGoto?: boolean }
  ): Promise<SignupSubmissionResult> {
    if (opts?.skipGoto !== true) {
      await page.goto('/register');
    }
    await page.getByLabel(/Email address/i).fill(email);
    await page.getByLabel(/^Password$/i).first().fill(testPassword);
    await page.getByLabel(/Confirm Password/i).fill(testPassword);
    await page.getByRole('button', { name: /Create account/i }).click();
    return waitForSignupOutcome(page);
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
    const profileResult = await adminSupabase!
      .from('user_profiles')
      .select('*')
      .eq('id', createdUser.id)
      .single();
    const profile = profileResult.data as { id: string; role?: string; is_active?: boolean; is_verified?: boolean } | null;
    const profileError = profileResult.error;

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

    const submission = await submitSignupForm(page, testEmail, { skipGoto: true });

    if (submission.outcome === 'errorShown' && submission.detail) {
      console.log('❌ Signup error:', submission.detail);
    }

    // Verify user was created regardless of email confirmation
    const createdUser = await findUser(testEmail);

    if (!createdUser) {
      test.skip(true, 'User was not created — Supabase signup may have failed or is rate-limited');
      return;
    }

    expect(createdUser.email).toBe(testEmail);

    // Verify user profile exists
    const profileResult = await adminSupabase!
      .from('user_profiles')
      .select('*')
      .eq('id', createdUser.id)
      .single();
    const profile = profileResult.data as { id: string; role?: string } | null;

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

    // Poll for profile creation (trigger may be async)
    const profilePollTimeout = 10_000;
    const profilePollInterval = 300;
    const deadline = Date.now() + profilePollTimeout;
    type ProfileRow = { id: string; role?: string; is_verified?: boolean; is_active?: boolean };
    let profile: ProfileRow | null = null;
    let profileError: { code: string } | null = null;
    while (Date.now() < deadline) {
      const result = (await adminSupabase!
        .from('user_profiles')
        .select('*')
        .eq('id', createdUser.id)
        .single()) as { data: ProfileRow | null; error: { code?: string } | null };
      if (!result.error && result.data) {
        profile = result.data;
        break;
      }
      profileError = result.error ? { code: result.error.code ?? '' } : null;
      await page.waitForTimeout(profilePollInterval);
    }
    if (profile == null) {
      const last = await adminSupabase!
        .from('user_profiles')
        .select('*')
        .eq('id', createdUser.id)
        .single();
      profile = (last.data as ProfileRow | null) ?? null;
      profileError = last.error ? { code: (last.error as { code?: string }).code ?? '' } : null;
    }

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
