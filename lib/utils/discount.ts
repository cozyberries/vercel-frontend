// lib/utils/discount.ts
import { EARLY_BIRD_OFFER, type Offer } from '@/lib/config/offers'

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
 * Returns display-ready price info for a given price.
 * When no offer is active, discounted === original and savings === 0.
 */
export function getDiscountedPrice(price: number): {
  original: number
  discounted: number
  savings: number
  offer: Offer | null
} {
  const offer = getActiveOffer()
  if (!offer) return { original: price, discounted: price, savings: 0, offer: null }
  const discounted = applyDiscount(price, offer.discountRate)
  return { original: price, discounted, savings: price - discounted, offer }
}
