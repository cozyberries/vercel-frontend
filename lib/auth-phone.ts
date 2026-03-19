import { createAdminSupabaseClient } from "@/lib/supabase-server";

const PHONE_PLACEHOLDER_DOMAIN =
  process.env.VERIFYNOW_PHONE_PLACEHOLDER_EMAIL_DOMAIN || "phone.cozyburry.local";

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export type PhoneUserResult = { userId: string; email: string };

/**
 * Find a user by phone number. Queries profiles by normalized phone, then
 * fetches email from auth. Returns null if no profile found.
 */
export async function findUserIdByPhone(phone: string): Promise<PhoneUserResult | null> {
  const supabase = createAdminSupabaseClient();
  const digits = normalizePhone(phone);

  const { data: row, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("phone", digits)
    .maybeSingle();

  if (profileError || !row) {
    return null;
  }

  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(row.id);
  if (authError || !authData?.user?.email) {
    return null;
  }

  return { userId: row.id, email: authData.user.email };
}

/**
 * Create a new user for phone-only auth (register flow). This is the single place
 * we create the Supabase user + profiles + user_profiles for phone signup.
 * Flow: auth user (placeholder email) → profiles (id, phone, full_name) → user_profiles (role: customer).
 * Profile page then shows this user's info; middleware allows /profile because profiles.phone is set.
 * If createUser fails due to duplicate, looks up by phone and returns that user if found.
 */
export async function createPhoneUser(phone: string): Promise<PhoneUserResult> {
  const supabase = createAdminSupabaseClient();
  const digits = normalizePhone(phone);
  const placeholderEmail = `phone+91${digits}@${PHONE_PLACEHOLDER_DOMAIN}`;

  const { data: createData, error: createError } = await supabase.auth.admin.createUser({
    email: placeholderEmail,
    email_confirm: true,
  });

  if (createError) {
    const isDuplicate =
      createError.message?.toLowerCase().includes("already") ||
      createError.message?.toLowerCase().includes("duplicate") ||
      createError.code === "user_already_exists";
    if (isDuplicate) {
      const existing = await findUserIdByPhone(phone);
      if (existing) return existing;
    }
    throw createError;
  }

  const userId = createData.user.id;
  const now = new Date().toISOString();

  const { error: profilesError } = await supabase.from("profiles").upsert(
    {
      id: userId,
      phone: digits,
      full_name: "User",
      updated_at: now,
    },
    { onConflict: "id" }
  );
  if (profilesError) {
    throw new Error(`Failed to create profile: ${profilesError.message}`);
  }

  const { error: userProfilesError } = await supabase
    .from("user_profiles")
    .upsert(
      {
        id: userId,
        full_name: "User",
        role: "customer",
        is_active: true,
        updated_at: now,
      },
      { onConflict: "id", ignoreDuplicates: false }
    );
  if (userProfilesError) {
    throw new Error(`Failed to create user profile: ${userProfilesError.message}`);
  }

  return { userId, email: placeholderEmail };
}
