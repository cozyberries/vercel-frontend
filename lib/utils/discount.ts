// lib/utils/discount.ts
import { EARLY_BIRD_OFFER, MRP_DISPLAY, type Offer } from '@/lib/config/offers'

/**
 * Returns the active offer if enabled and not expired, otherwise null.
 * Call this wherever offer-gated UI or logic is needed.
 */
export function getActiveOffer(): Offer | null {
  const offer = EARLY_BIRD_OFFER
  if (!offer.enabled) return null
  if (new Date() > offer.expiresAt) return null
  return offer
}

/**
 * Apply a discount rate to a price using Math.floor for consistent
 * client/server rounding (avoids ₹1 discrepancies).
 */
export function applyDiscount(price: number, rate: number): number {
  return Math.floor(price * (1 - rate))
}

/**
 * The struck-through MRP for a catalogue price: the price sits MRP_DISPLAY.discountRate below it.
 * Display only — carts, orders and invoices always use the catalogue price.
 */
export function mrpFor(price: number): number {
  const rate = MRP_DISPLAY.discountRate
  if (!(rate > 0 && rate < 1)) return price
  return Math.round(price / (1 - rate))
}

/**
 * Returns display-ready price info for a given price: the MRP, what the customer pays (after the
 * Early Bird coupon, if one runs) and a badge worked out from those two numbers.
 * With no MRP and no coupon, discounted === original and badgeText is null.
 */
export function getDiscountedPrice(price: number): {
  original: number
  discounted: number
  savings: number
  badgeText: string | null
} {
  const offer = getActiveOffer()
  const original = mrpFor(price)
  const discounted = offer ? applyDiscount(price, offer.discountRate) : price
  const savings = original - discounted
  const badgeText = savings > 0 ? `${Math.round((savings / original) * 100)}% OFF` : null
  return { original, discounted, savings, badgeText }
}

/**
 * MRP total and the saving against the catalogue subtotal for cart lines or order items.
 * Pass `placedAt` for an existing order: one placed before the MRP was shown reports no saving.
 */
export function mrpTotals(
  items: { price: number; quantity: number }[],
  placedAt?: string | Date,
): { totalMrp: number; mrpSavings: number } {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  if (placedAt !== undefined && new Date(placedAt) < MRP_DISPLAY.shownSince) {
    return { totalMrp: subtotal, mrpSavings: 0 }
  }
  const totalMrp = items.reduce((sum, item) => sum + mrpFor(item.price) * item.quantity, 0)
  return { totalMrp, mrpSavings: totalMrp - subtotal }
}
