/**
 * Returns true if the email is a system-generated placeholder for phone-only users.
 * Current format:      {digits}@phone.cozyberries.local  (default of VERIFYNOW_PHONE_PLACEHOLDER_EMAIL_DOMAIN)
 * Transitional format: {digits}@phone.cozyberries.in
 * The misspelled legacy format (phone+91{digits}@phone.cozyburry.local) was retired on 2026-09-13:
 * no auth user or stored order email used it any more.
 */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.endsWith("@phone.cozyberries.local") || email.endsWith("@phone.cozyberries.in");
}
