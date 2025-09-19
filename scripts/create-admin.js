#!/usr/bin/env node

/**
 * CLI Script to create admin users
 * Usage: node scripts/create-admin.js
 */

const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function questionHidden(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    let password = '';
    process.stdin.on('data', function(char) {
      char = char + '';
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004':
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write('\n');
          resolve(password);
          break;
        case '\u0003':
          process.exit();
          break;
        case '\u007f': // backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b');
          }
          break;
        default:
          password += char;
          process.stdout.write('*');
          break;
      }
    });
  });
}

async function createAdminUser() {
  console.log('🔧 Admin User Creation Script');
  console.log('================================\n');

  try {
    // Check environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

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

    // Get user input
    const email = await question('Admin email: ');
    if (!email || !email.includes('@')) {
      console.error('❌ Please enter a valid email address');
      process.exit(1);
    }

    const password = await questionHidden('Admin password: ');
    if (!password || password.length < 8) {
      console.error('❌ Password must be at least 8 characters long');
      process.exit(1);
    }

    const confirmPassword = await questionHidden('Confirm password: ');
    if (password !== confirmPassword) {
      console.error('❌ Passwords do not match');
      process.exit(1);
    }

    const fullName = await question('Full name (optional): ') || 'Administrator';
    const roleInput = await question('Role (admin/super_admin) [super_admin]: ');
    const role = roleInput.toLowerCase() === 'admin' ? 'admin' : 'super_admin';

    console.log('\n🔄 Creating admin user...');

    // Create user in auth.users
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: role
      }
    });

    if (authError) {
      console.error('❌ Failed to create auth user:', authError.message);
      process.exit(1);
    }

    console.log('✅ Auth user created:', authUser.user.id);

    // Create user profile
    const { error: profileError } = await supabase
      .from('user_profiles')
      .upsert({
        id: authUser.user.id,
        role: role,
        full_name: fullName,
        is_active: true,
        is_verified: true,
        admin_notes: `Created via CLI script on ${new Date().toISOString()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (profileError) {
      console.error('❌ Failed to create user profile:', profileError.message);
      console.log('🔄 Cleaning up auth user...');
      await supabase.auth.admin.deleteUser(authUser.user.id);
      process.exit(1);
    }

    console.log('✅ User profile created');

    // Generate JWT token
    const payload = {
      id: authUser.user.id,
      email: authUser.user.email,
      role: role,
      isAnonymous: false
    };

    const token = jwt.sign(payload, jwtSecret, {
      expiresIn: '7d',
      issuer: 'your-app-name',
      audience: 'your-app-users'
    });

    console.log('\n🎉 Admin user created successfully!');
    console.log('================================');
    console.log(`Email: ${email}`);
    console.log(`Role: ${role}`);
    console.log(`User ID: ${authUser.user.id}`);
    console.log(`JWT Token: ${token}`);
    console.log('\n💡 You can now log in to the admin panel with these credentials.');

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run the script
if (require.main === module) {
  createAdminUser().catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

module.exports = { createAdminUser };
