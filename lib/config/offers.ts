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

// Display-only MRP: every catalogue price is shown as MRP less this share of it, so the price
// charged never changes. 0 (or anything outside [0, 1)) hides the MRP everywhere.
// The display ran from shownSince to shownUntil; on 7 Oct 2026 it ended and the catalogue prices
// went up 10% instead. Orders placed inside the window keep their MRP on /orders and the invoice.
export interface MrpDisplay {
  discountRate: number   // 0.1 = MRP is price ÷ 0.9
  shownSince: Date       // orders placed before this show no MRP saving
  shownUntil: Date       // products, carts and orders from this moment on show no MRP
}

const _DEFAULT_MRP_SINCE = '2026-09-27T00:00:00+05:30'
const _DEFAULT_MRP_UNTIL = '2026-10-07T00:00:00+05:30'
const _mrpRate  = parseFloat(process.env.NEXT_PUBLIC_MRP_DISCOUNT_RATE ?? '0.1')
const _mrpSince = new Date(process.env.NEXT_PUBLIC_MRP_SHOWN_SINCE ?? _DEFAULT_MRP_SINCE)
const _mrpUntil = new Date(process.env.NEXT_PUBLIC_MRP_SHOWN_UNTIL ?? _DEFAULT_MRP_UNTIL)

export const MRP_DISPLAY: MrpDisplay = {
  discountRate: isNaN(_mrpRate) ? 0.1 : _mrpRate >= 0 && _mrpRate < 1 ? _mrpRate : 0,
  shownSince:   isNaN(_mrpSince.getTime()) ? new Date(_DEFAULT_MRP_SINCE) : _mrpSince,
  shownUntil:   isNaN(_mrpUntil.getTime()) ? new Date(_DEFAULT_MRP_UNTIL) : _mrpUntil,
}
