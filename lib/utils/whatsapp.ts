import { getIndianPhoneDigits } from "@/lib/utils/validation";

/** wa.me link to an Indian mobile, or null when the number is unusable. */
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const digits = getIndianPhoneDigits(phone ?? "");
  if (digits.length !== 10) return null;
  return `https://wa.me/91${digits}?text=${encodeURIComponent(text)}`;
}
