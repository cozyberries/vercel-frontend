import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Product } from "@/lib/services/api"
import { GST_RATE } from "@/lib/constants"

/**
 * Price inclusive of 5% GST for display and cart. Rounded to whole number.
 */
export function priceWithGst(price: number): number {
  return Math.round(price * (1 + GST_RATE))
}

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
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Compute the lowest in-stock price across sizes/variants.
 * Returns the minimum price and whether a price range exists.
 */
export function getMinPrice(product: Pick<Product, "price" | "sizes" | "variants">): { min: number; hasRange: boolean } {
  const prices: number[] = [];
  if (product.variants?.length) {
    product.variants.filter(v => (v.stock_quantity ?? 0) > 0).forEach(v => prices.push(v.price));
  } else if (product.sizes?.length) {
    product.sizes.filter(s => (s.stock_quantity ?? 0) > 0).forEach(s => prices.push(s.price));
  }
  if (!prices.length) prices.push(product.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { min, hasRange: min !== max };
}
