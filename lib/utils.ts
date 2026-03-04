import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Product } from "@/lib/services/api"

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

/**
 * Compute the lowest in-stock price across sizes/variants.
 * Returns the minimum price and whether a price range exists.
 */
export function getMinPrice(product: Pick<Product, "price" | "sizes" | "variants">): { min: number; hasRange: boolean } {
  const prices: number[] = [];
  if (product.variants?.length) {
    product.variants.filter(v => (v.stock_quantity ?? 0) > 0).forEach(v => prices.push(v.price));
  } else if (product.sizes?.length) {
    product.sizes.forEach(s => prices.push(s.price));
  }
  if (!prices.length) prices.push(product.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { min, hasRange: min !== max };
}
