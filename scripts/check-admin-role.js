// Script to check and set admin role for a user
// Run this script to check if your user has admin privileges

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase environment variables. Make sure you have:');
  console.error('- NEXT_PUBLIC_SUPABASE_URL');
  console.error('- SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkAndFixAdminRole() {
  try {
    console.log('🔍 Checking user profiles and admin roles...\n');

    // Get all users from auth.users
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('❌ Error fetching auth users:', authError);
      return;
    }

    console.log(`📊 Found ${authUsers.users.length} users in auth.users`);

    // Get all user profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (profilesError) {
      console.error('❌ Error fetching user profiles:', profilesError);
      return;
    }

    console.log(`📊 Found ${profiles.length} profiles in user_profiles\n`);

    // Show all users and their roles
    console.log('👥 Users and their roles:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    for (const authUser of authUsers.users) {
      const profile = profiles.find(p => p.id === authUser.id);
      const role = profile?.role || 'NO PROFILE';
      const roleIcon = role === 'super_admin' ? '👑' : role === 'admin' ? '🛡️' : role === 'customer' ? '👤' : '❓';
      
      console.log(`${roleIcon} ${authUser.email} (${authUser.id.substring(0, 8)}...)`);
      console.log(`   Role: ${role}`);
      console.log(`   Created: ${authUser.created_at}`);
      console.log(`   Last Sign In: ${authUser.last_sign_in_at || 'Never'}`);
      
      if (!profile) {
        console.log('   ⚠️  Missing user profile - creating...');
        
        // Create missing profile
        const { error: insertError } = await supabase
          .from('user_profiles')
          .insert({
            id: authUser.id,
            role: 'customer',
            full_name: authUser.email.split('@')[0],
            is_active: true,
            is_verified: true
          });

        if (insertError) {
          console.log(`   ❌ Failed to create profile: ${insertError.message}`);
        } else {
          console.log('   ✅ Profile created with customer role');
        }
      }
      console.log('');
    }

    // Check for admin users
    const adminUsers = profiles.filter(p => ['admin', 'super_admin'].includes(p.role));
    
    if (adminUsers.length === 0) {
      console.log('⚠️  No admin users found!');
      console.log('');
      console.log('To make a user admin, run this command in your Supabase SQL editor:');
      console.log('');
      console.log("UPDATE user_profiles SET role = 'super_admin' WHERE id = 'USER_ID_HERE';");
      console.log('');
      console.log('Replace USER_ID_HERE with the actual user ID from the list above.');
    } else {
      console.log(`✅ Found ${adminUsers.length} admin user(s):`);
      adminUsers.forEach(admin => {
        const authUser = authUsers.users.find(u => u.id === admin.id);
        const roleIcon = admin.role === 'super_admin' ? '👑' : '🛡️';
        console.log(`   ${roleIcon} ${authUser?.email} (${admin.role})`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the script
checkAndFixAdminRole().then(() => {
  console.log('\n🎉 Admin role check completed!');
  process.exit(0);
});
