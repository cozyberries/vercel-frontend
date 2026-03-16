// lib/config/offers.ts
export interface Offer {
  code: string
  discountRate: number   // 0.05 = 5%
  expiresAt: Date
  enabled: boolean
  label: string          // displayed in UI e.g. "Early Bird Offer"
  badgeText: string      // e.g. "5% OFF"
}

const _code        = process.env.NEXT_PUBLIC_EARLY_BIRD_CODE    ?? 'EARLY5'
const _rate        = parseFloat(process.env.NEXT_PUBLIC_EARLY_BIRD_RATE ?? '0.05')
const _expiresAt   = new Date(process.env.NEXT_PUBLIC_EARLY_BIRD_EXPIRES ?? '2026-04-30T23:59:59+05:30')
const _enabled     = (process.env.NEXT_PUBLIC_EARLY_BIRD_ENABLED ?? 'true') === 'true'
const _discountPct = `${Math.round((isNaN(_rate) ? 0.05 : _rate) * 100)}% OFF`

export const EARLY_BIRD_OFFER: Offer = {
  code:         _code,
  discountRate: isNaN(_rate) ? 0.05 : _rate,
  expiresAt:    isNaN(_expiresAt.getTime()) ? new Date('2026-04-30T23:59:59+05:30') : _expiresAt,
  enabled:      _enabled,
  label:        'Early Bird Offer',
  badgeText:    _discountPct,
}
