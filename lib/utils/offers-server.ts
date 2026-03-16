// lib/utils/offers-server.ts
import { EARLY_BIRD_OFFER } from '@/lib/config/offers'
import type { Offer } from '@/lib/config/offers'

export interface AppliedDiscount {
  discountCode: string
  discountAmount: number
  offer: Offer
}

export type OfferValidationResult =
  | { ok: true; data: AppliedDiscount }
  | { ok: false; error: string }

/**
 * Validates a coupon code against the current active offer and computes
 * the discount amount for the given subtotal.
 *
 * Returns ok:true with AppliedDiscount on success.
 * Returns ok:false with an error string when the coupon is invalid/expired.
 */
export function validateAndApplyOffer(
  couponCode: string,
  subtotalRupees: number
): OfferValidationResult {
  const offer = EARLY_BIRD_OFFER

  const isValid =
    offer.enabled &&
    couponCode.trim().toUpperCase() === offer.code.toUpperCase() &&
    new Date() <= offer.expiresAt

  if (!isValid) {
    return { ok: false, error: 'This offer has expired or is invalid.' }
  }

  return {
    ok: true,
    data: {
      discountCode: offer.code,
      discountAmount: Math.floor(subtotalRupees * offer.discountRate),
      offer,
    },
  }
}

/**
 * Returns the active server-side offer, or null if disabled/expired.
 * Use this in API routes and Server Components only.
 */
export function getActiveOfferServer(): Offer | null {
  const offer = EARLY_BIRD_OFFER
  if (!offer.enabled) return null
  if (new Date() > offer.expiresAt) return null
  return offer
}
