import { createAdminSupabaseClient } from "@/lib/supabase-server";

const PHONE_PLACEHOLDER_DOMAIN =
  process.env.VERIFYNOW_PHONE_PLACEHOLDER_EMAIL_DOMAIN || "phone.cozyberries.local";

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export type PhoneUserResult = { userId: string; email: string };

/**
 * Find a user by phone number. Scans auth users by normalized phone number.
 * Returns null if no matching user found.
 */
export async function findUserIdByPhone(phone: string): Promise<PhoneUserResult | null> {
  const supabase = createAdminSupabaseClient();
  const digits = normalizePhone(phone);

  let page = 1;
  const perPage = 1000;
  const maxPages = 20;
  while (page <= maxPages) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    if (!data?.users?.length) break;
    const user = data.users.find((u) => normalizePhone(u.phone ?? "") === digits);
    if (user?.email) return { userId: user.id, email: user.email };
    if (data.users.length < perPage) break;
    page++;
  }
  return null;
}

export type CreatePhoneUserOptions = {
  fullName?: string;
  email?: string;
};

/**
 * Find a Supabase auth user by email using admin listUsers.
 * Used both as error recovery in createPhoneUser and as an explicit lookup
 * in the verify route when a user provides an email that already exists.
 */
export async function findAuthUserByEmail(
  email: string
): Promise<{ id: string; email: string } | null> {
  const supabase = createAdminSupabaseClient();
  const normalizedEmail = email.toLowerCase();
  let page = 1;
  const perPage = 1000;
  const maxPages = 20; // guard against pathological user counts (20k users)
  while (page <= maxPages) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    if (!data?.users?.length) break;
    const user = data.users.find((u) => u.email?.toLowerCase() === normalizedEmail);
    if (user?.email) return { id: user.id, email: user.email };
    if (data.users.length < perPage) break;
    page++;
  }
  return null;
}

/**
 * Create a new user for phone-only auth (register flow). This is the single place
 * we create the Supabase user + profiles + user_profiles for phone signup.
 * Optional fullName and email (from register form) are saved to profiles and auth.
 * If createUser fails due to duplicate, looks up by phone and returns that user if found.
 */
export async function createPhoneUser(
  phone: string,
  options?: CreatePhoneUserOptions
): Promise<PhoneUserResult> {
  const supabase = createAdminSupabaseClient();
  const digits = normalizePhone(phone);
  const fullName = options?.fullName?.trim() || "User";
  const preferredEmail = options?.email?.trim();
  const authEmail = preferredEmail || `${digits}@${PHONE_PLACEHOLDER_DOMAIN}`;

  const { data: createData, error: createError } = await supabase.auth.admin.createUser({
    email: authEmail,
    email_confirm: true,
  });

  if (createError) {
    const code = (createError as { code?: string }).code;
    const isDuplicate =
      code === "email_exists" ||
      code === "user_already_exists" ||
      createError.message?.toLowerCase().includes("already") ||
      createError.message?.toLowerCase().includes("duplicate");

    if (isDuplicate) {
      // 1. Phone-based lookup (happy path: returning user)
      const existing = await findUserIdByPhone(phone);
      if (existing) return existing;

      // 2. Email-based lookup — covers two recovery scenarios:
      //    a) placeholder email: auth user exists but profiles row is missing
      //    b) user-provided email: belongs to an account that has no phone on file
      const authUser = await findAuthUserByEmail(authEmail);
      if (authUser) {
        if (!preferredEmail) {
          // Placeholder email: recover by writing the phone back via admin API
          await supabase.auth.admin.updateUserById(authUser.id, {
            phone: digits,
          });
        } else {
          // User-provided email exists in a different account — surface a clear error
          const conflict = new Error(
            "This email is already registered with another account. Please sign in instead, or register without an email."
          );
          Object.assign(conflict, { code: "email_registered_elsewhere", status: 409 });
          throw conflict;
        }
        return { userId: authUser.id, email: authUser.email };
      }
    }
    throw createError;
  }

  const userId = createData.user.id;

  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { role: "customer" },
    phone: digits,
    user_metadata: { full_name: fullName },
  });
  if (updateError) {
    throw new Error(`Failed to set user metadata: ${updateError.message}`);
  }

  return { userId, email: authEmail };
}
