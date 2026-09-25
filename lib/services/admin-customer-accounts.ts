/**
 * Shared by /api/admin/users/send-otp and /api/admin/users/create: the same
 * input rules and the same duplicate lookup, so the OTP is only ever sent for
 * an account that create will accept.
 *
 * The lookup pages through auth.admin.listUsers with a hard cap and stops at
 * the first match: auth.users is not exposed via PostgREST, and a single
 * page silently missed users past the first 1000.
 */
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getIndianPhoneDigits, validateEmail } from "@/lib/utils/validation";

export const PHONE_PLACEHOLDER_DOMAIN =
  process.env.VERIFYNOW_PHONE_PLACEHOLDER_EMAIL_DOMAIN || "phone.cozyberries.local";
export const FULL_NAME_MAX = 120;

const LIST_PER_PAGE = 1000;
const MAX_PAGES = 20;

export type NewCustomerInput = {
  rawEmail: string;
  normalizedEmail: string;
  phoneDigits: string;
  fullName: string;
};

export function parseNewCustomer(body: {
  email?: unknown;
  phone?: unknown;
  full_name?: unknown;
}): { ok: true; value: NewCustomerInput } | { ok: false; error: string } {
  const rawEmail = typeof body.email === "string" ? body.email.trim() : "";
  const rawPhone = typeof body.phone === "string" ? body.phone : "";
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";

  if (rawEmail) {
    const emailResult = validateEmail(rawEmail);
    if (!emailResult.isValid) {
      return { ok: false, error: emailResult.error ?? "Invalid email" };
    }
  }

  const phoneDigits = getIndianPhoneDigits(rawPhone);
  if (phoneDigits.length !== 10) {
    return { ok: false, error: "Phone number must be exactly 10 digits (Indian format)" };
  }
  if (!/^[6-9]/.test(phoneDigits)) {
    return { ok: false, error: "Indian mobile numbers must start with 6, 7, 8, or 9" };
  }

  if (!fullName) {
    return { ok: false, error: "Full name is required" };
  }
  if (fullName.length > FULL_NAME_MAX) {
    return { ok: false, error: `Full name must be ${FULL_NAME_MAX} characters or fewer` };
  }

  return {
    ok: true,
    value: {
      rawEmail,
      normalizedEmail: rawEmail ? rawEmail.toLowerCase() : `${phoneDigits}@${PHONE_PLACEHOLDER_DOMAIN}`,
      phoneDigits,
      fullName,
    },
  };
}

/** Every representation Supabase may have stored a phone in. */
function phoneCandidates(digits: string): Set<string> {
  const e164NoPlus = `91${digits}`;
  return new Set([digits, e164NoPlus, `+${e164NoPlus}`]);
}

export async function findExistingUser(
  adminClient: SupabaseClient,
  normalizedEmail: string,
  phoneDigits: string
): Promise<User | null> {
  const phones = phoneCandidates(phoneDigits);

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: LIST_PER_PAGE });
    if (error) {
      throw error;
    }

    const batch = (data?.users ?? []) as User[];
    for (const user of batch) {
      const emailMatch = (user.email ?? "").toLowerCase() === normalizedEmail;
      const phoneMatch = phones.has(user.phone ?? "");
      if (emailMatch || phoneMatch) {
        return user;
      }
    }

    if (batch.length < LIST_PER_PAGE) {
      return null;
    }
    if (page === MAX_PAGES) {
      console.warn(
        `[admin-customer-accounts] hit MAX_PAGES=${MAX_PAGES} during duplicate scan; accepting best-effort result`
      );
    }
  }

  return null;
}
