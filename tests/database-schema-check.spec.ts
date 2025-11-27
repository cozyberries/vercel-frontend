import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * Database Schema Check
 * 
 * This test checks if the user_profiles table has the correct schema
 * and if we can insert a test profile.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.describe('Database Schema Check', () => {
  test('should verify user_profiles table structure', async () => {
    test.skip(!supabaseUrl || !serviceRoleKey, 'Supabase credentials not configured');

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Try to query the table structure by attempting a select
    const { data, error } = await adminSupabase
      .from('user_profiles')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Error accessing user_profiles table:', error);
      throw new Error(`Cannot access user_profiles table: ${error.message}`);
    }

    console.log('✅ user_profiles table is accessible');
  });

  test('should check required fields in user_profiles', async () => {
    test.skip(!supabaseUrl || !serviceRoleKey, 'Supabase credentials not configured');

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Create a test user first
    const testEmail = `schema-test-${Date.now()}@example.com`;
    const { data: authUser, error: authError } = await adminSupabase.auth.admin.createUser({
      email: testEmail,
      password: 'TestPassword123!',
      email_confirm: true,
    });

    if (authError || !authUser.user) {
      console.error('❌ Failed to create test user:', authError);
      throw new Error('Cannot create test user for schema check');
    }

    console.log('✅ Test user created:', authUser.user.id);

    // Try to create a profile with minimal fields (what we're using in signup)
    const { data: profile, error: profileError } = await adminSupabase
      .from('user_profiles')
      .insert({
        id: authUser.user.id,
        role: 'customer',
        is_active: true,
        is_verified: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (profileError) {
      console.error('❌ Error creating profile with minimal fields:', profileError);
      console.error('Error details:', JSON.stringify(profileError, null, 2));
      
      // Try with all possible fields
      const { error: fullProfileError } = await adminSupabase
        .from('user_profiles')
        .insert({
          id: authUser.user.id,
          role: 'customer',
          full_name: null,
          phone: null,
          is_active: true,
          is_verified: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (fullProfileError) {
        console.error('❌ Error with all fields:', fullProfileError);
        throw new Error(`Cannot create profile: ${fullProfileError.message}`);
      } else {
        console.log('✅ Profile created successfully with all fields');
      }
    } else {
      console.log('✅ Profile created successfully with minimal fields');
    }

    // Clean up
    await adminSupabase.auth.admin.deleteUser(authUser.user.id);
    console.log('🧹 Test user cleaned up');
  });

  test('should check if there are database triggers causing issues', async () => {
    test.skip(!supabaseUrl || !serviceRoleKey, 'Supabase credentials not configured');

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Try to create a user via signup API to see the actual error
    const testEmail = `trigger-test-${Date.now()}@example.com`;
    
    // Use the public signup endpoint
    const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      },
      body: JSON.stringify({
        email: testEmail,
        password: 'TestPassword123!',
      }),
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('❌ Signup API error:', result);
      console.error('Error message:', result.error_description || result.message);
      console.error('Error code:', result.error || result.code);
    } else {
      console.log('✅ Signup API succeeded');
      console.log('User created:', result.user?.id);
      
      // Clean up
      if (result.user?.id) {
        await adminSupabase.auth.admin.deleteUser(result.user.id);
      }
    }
  });
});




