import { getIndianPhoneDigits } from "@/lib/utils/validation";

/**
 * WhatsApp chat link to an Indian mobile, or null when the number is unusable.
 * Not wa.me: its redirect to api.whatsapp.com replaces every emoji with "�".
 */
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const digits = getIndianPhoneDigits(phone ?? "");
  if (digits.length !== 10) return null;
  return `https://api.whatsapp.com/send?phone=91${digits}&text=${encodeURIComponent(text)}`;
}
