/**
 * Delete a Supabase Auth user by email. Removes related rows first to satisfy FKs.
 * Usage: node scripts/delete-supabase-user.mjs <email>
 * Example: node scripts/delete-supabase-user.mjs testuser.cozy@yopmail.com
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
const email = process.argv[2] || process.env.DELETE_USER_EMAIL;

if (!email) {
  console.error("Usage: node scripts/delete-supabase-user.mjs <email>");
  process.exit(1);
}
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  let user = null;
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data: userList, error: listError } = await supabase.auth.admin.listUsers({
      perPage,
      page,
    });
    if (listError) {
      console.error("List users error:", listError.message);
      process.exit(1);
    }
    const found = userList.users.find((u) => u.email === email);
    if (found) {
      user = found;
      break;
    }
    if (userList.users.length < perPage) {
      break;
    }
    page += 1;
  }
  if (!user) {
    console.log("User not found:", email);
    process.exit(0);
  }
  const userId = user.id;
  console.log("Deleting user and related data:", email, userId);

  const del = async (table, col, value) => {
    const { error } = await supabase.from(table).delete().eq(col, value);
    if (error) console.warn(`  ${table}: ${error.message}`);
  };

  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("id")
    .eq("user_id", userId);
  if (ordersError) {
    console.error("Orders query error:", ordersError.message);
    process.exit(1);
  }
  const orderIds = (orders || []).map((o) => o.id);
  // checkout_sessions.order_id FK blocks order deletes unless cleared first
  await del("checkout_sessions", "user_id", userId);
  for (const orderId of orderIds) {
    await del("order_items", "order_id", orderId);
    await del("payments", "order_id", orderId);
  }
  await del("payments", "user_id", userId);
  await del("orders", "user_id", userId);
  await del("user_addresses", "user_id", userId);
  await del("user_carts", "user_id", userId);
  await del("user_wishlists", "user_id", userId);
  await del("ratings", "user_id", userId);
  await del("notifications", "user_id", userId);
  await del("event_logs", "user_id", userId);
  await del("profiles", "id", userId);
  await del("user_profiles", "id", userId);

  const { error: delError } = await supabase.auth.admin.deleteUser(userId);
  if (delError) {
    console.error("Delete user error:", delError.message);
    process.exit(1);
  }
  console.log("Deleted user:", email);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
