// lib/config/offers.ts
export interface Offer {
  code: string
  discountRate: number   // 0.05 = 5%
  expiresAt: Date
  enabled: boolean
  label: string          // displayed in UI e.g. "Early Bird Offer"
  badgeText: string      // e.g. "5% OFF"
}

export const EARLY_BIRD_OFFER: Offer = {
  code: 'EARLY5',
  discountRate: 0.05,
  expiresAt: new Date('2026-04-30T23:59:59+05:30'),
  enabled: true,
  label: 'Early Bird Offer',
  badgeText: '5% OFF',
}
