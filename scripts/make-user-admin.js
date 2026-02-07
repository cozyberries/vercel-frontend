// Script to make a specific user admin
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function makeUserAdmin(userEmail) {
  try {
    console.log(`🔍 Looking for user: ${userEmail}...`);

    // Get user by email
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('❌ Error fetching users:', authError);
      return;
    }

    const user = authUsers.users.find(u => u.email === userEmail);
    
    if (!user) {
      console.error(`❌ User not found: ${userEmail}`);
      return;
    }

    console.log(`✅ Found user: ${user.email} (${user.id})`);

    // Update user profile to super_admin
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ 
        role: 'super_admin',
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)
      .select();

    if (error) {
      console.error('❌ Error updating user role:', error);
      return;
    }

    console.log('🎉 User role updated successfully!');
    console.log(`👑 ${user.email} is now a super_admin`);

    // Verify the update
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    console.log(`✅ Verified role: ${profile?.role}`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Get email from command line argument
const userEmail = process.argv[2];

if (!userEmail) {
  console.log('Usage: node make-user-admin.js <email>');
  console.log('Example: node make-user-admin.js abdul@cellstrat.com');
  process.exit(1);
}

makeUserAdmin(userEmail).then(() => {
  process.exit(0);
});
