import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number as localized currency using Intl.NumberFormat.
 * @param amount - Price or amount to format
 * @param locale - BCP 47 locale (default: "en-IN")
 * @param currency - ISO 4217 currency code (default: "INR")
 */
export function formatPrice(
  amount: number,
  locale: string = "en-IN",
  currency: string = "INR"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
