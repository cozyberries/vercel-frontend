/**
 * One-off script: reset password for the test admin user in Supabase Auth.
 * Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
 * Reads TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD from .env.local (or uses defaults).
 *
 * Run: node scripts/reset-test-user-password.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
config({ path: resolve(root, ".env.local") });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.TEST_ADMIN_EMAIL || "test_admin_user@example.com";
const newPassword = process.env.TEST_ADMIN_PASSWORD || "TestPassword123!";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("Looking up user by email:", email);

  const { data: userList, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) {
    console.error("List users error:", listError.message);
    process.exit(1);
  }

  const user = userList.users.find((u) => u.email === email);
  if (!user) {
    console.log("User not found. Creating user with email and password...");
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: newPassword,
      email_confirm: true,
    });
    if (createError) {
      console.error("Create user error:", createError.message);
      process.exit(1);
    }
    console.log("Created user:", newUser.user.id, newUser.user.email);
    return;
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    password: newPassword,
  });
  if (updateError) {
    console.error("Update password error:", updateError.message);
    process.exit(1);
  }
  console.log("Password reset successfully for:", email);
}

main();
