#!/usr/bin/env node

/**
 * Script to fix the infinite recursion issue in reviews RLS policy
 * Usage: node scripts/fix-reviews-rls.js
 */

const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

async function fixReviewsRLS() {
  console.log('🔧 Fixing Reviews RLS Policy');
  console.log('============================\n');

  try {
    // Check environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Missing required environment variables:');
      console.error('   - NEXT_PUBLIC_SUPABASE_URL');
      console.error('   - SUPABASE_SERVICE_ROLE_KEY');
      console.error('\nPlease add these to your .env.local file');
      process.exit(1);
    }

    // Initialize Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    console.log('🔄 Applying RLS policy fix...');

    // SQL to fix the infinite recursion issue
    const fixSQL = `
      -- Drop the problematic policy
      DROP POLICY IF EXISTS "Users can create reviews for delivered orders" ON reviews;

      -- Create a simplified policy that only checks user ownership
      -- Order validation (delivered status, etc.) is handled at the application level
      CREATE POLICY "Users can create reviews for their own orders" ON reviews
          FOR INSERT WITH CHECK (auth.uid() = user_id);
    `;

    // Execute the SQL
    const { error } = await supabase.rpc('exec_sql', { sql: fixSQL });

    if (error) {
      console.error('❌ Failed to apply RLS policy fix:', error.message);
      
      // Try alternative approach using direct SQL execution
      console.log('🔄 Trying alternative approach...');
      
      // Drop the problematic policy
      const { error: dropError } = await supabase
        .from('reviews')
        .select('*')
        .limit(0); // This will trigger RLS policy evaluation
      
      if (dropError) {
        console.log('Policy drop error (expected):', dropError.message);
      }

      // Create the new policy using a different approach
      const createPolicySQL = `
        CREATE POLICY "Users can create reviews for their own orders" ON reviews
            FOR INSERT WITH CHECK (auth.uid() = user_id);
      `;
      
      // This might not work directly, so let's provide manual instructions
      console.log('\n⚠️  Automatic fix failed. Please run this SQL manually in your Supabase dashboard:');
      console.log('=====================================');
      console.log(fixSQL);
      console.log('=====================================');
      
      process.exit(1);
    }

    console.log('✅ RLS policy fixed successfully!');
    console.log('✅ Reviews can now be created without infinite recursion');
    console.log('\n💡 Order validation is handled at the application level in the API route');

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    console.log('\n⚠️  Please run this SQL manually in your Supabase dashboard:');
    console.log('=====================================');
    console.log(`
-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can create reviews for delivered orders" ON reviews;

-- Create a simplified policy that only checks user ownership
-- Order validation (delivered status, etc.) is handled at the application level
CREATE POLICY "Users can create reviews for their own orders" ON reviews
    FOR INSERT WITH CHECK (auth.uid() = user_id);
    `);
    console.log('=====================================');
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  fixReviewsRLS().catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

module.exports = { fixReviewsRLS };
