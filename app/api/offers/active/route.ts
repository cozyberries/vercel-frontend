// app/api/offers/active/route.ts
import { NextResponse } from 'next/server'
import { getActiveOfferServer } from '@/lib/utils/offers-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const offer = getActiveOfferServer()

  if (!offer) {
    return NextResponse.json(
      { offer: null },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    )
  }

  return NextResponse.json(
    {
      offer: {
        code: offer.code,
        discountRate: offer.discountRate,
        expiresAt: offer.expiresAt.toISOString(),
        label: offer.label,
        badgeText: offer.badgeText,
        enabled: offer.enabled,
      },
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    }
  )
}
