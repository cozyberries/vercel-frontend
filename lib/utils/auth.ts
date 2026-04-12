/**
 * Returns true if the email is a system-generated placeholder for phone-only users.
 * New format:  {digits}@phone.cozyberries.local
 * Mid format:  {digits}@phone.cozyberries.in  (transitional)
 * Old format:  phone+91{digits}@phone.cozyburry.local  (legacy, existing users)
 */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return (
    email.endsWith("@phone.cozyberries.local") ||
    email.endsWith("@phone.cozyberries.in") ||
    (email.startsWith("phone+") && email.includes("@phone."))
  );
}
