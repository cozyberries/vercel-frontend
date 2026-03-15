// components/early-bird-banner.tsx
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getActiveOffer } from '@/lib/utils/discount'

interface TimeLeft {
  days: number
  hrs: number
  mins: number
  secs: number
}

function getTimeLeft(expiresAt: Date): TimeLeft {
  const diff = Math.max(0, expiresAt.getTime() - Date.now())
  return {
    days: Math.floor(diff / 86400000),
    hrs:  Math.floor((diff % 86400000) / 3600000),
    mins: Math.floor((diff % 3600000) / 60000),
    secs: Math.floor((diff % 60000) / 1000),
  }
}

function CountdownBox({ value, label }: { value: number; label: string }) {
  return (
    <div
      style={{ background: '#fff', border: '1px solid #d4b896' }}
      className="rounded-xl px-3 py-2.5 text-center min-w-[56px]"
    >
      <div style={{ color: '#3d2b1a' }} className="text-2xl font-extrabold leading-none">
        {String(value).padStart(2, '0')}
      </div>
      <div style={{ color: '#a0896e' }} className="text-[9px] uppercase tracking-widest mt-0.5">
        {label}
      </div>
    </div>
  )
}

export default function EarlyBirdBanner() {
  const offer = getActiveOffer()
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null)

  useEffect(() => {
    if (!offer) return
    setTimeLeft(getTimeLeft(offer.expiresAt))
    const id = setInterval(() => setTimeLeft(getTimeLeft(offer.expiresAt)), 1000)
    return () => clearInterval(id)
  }, [offer])

  if (!offer) return null

  return (
    <section
      style={{
        background: 'linear-gradient(135deg, #f5eee0 0%, #eddfc9 100%)',
        borderTop: '2px solid #c9a87c',
        borderBottom: '2px solid #c9a87c',
      }}
      className="w-full py-8 px-4"
    >
      <div className="max-w-lg mx-auto text-center">
        {/* Boho decoration */}
        <div className="text-2xl mb-3 tracking-widest opacity-60" aria-hidden>
          🌿 ✿ 🌿
        </div>

        <p
          style={{ color: '#c47c5a' }}
          className="text-xs font-bold tracking-[0.15em] uppercase mb-1.5"
        >
          We Just Launched!
        </p>

        <h2
          style={{ color: '#3d2b1a' }}
          className="text-2xl md:text-3xl font-extrabold leading-tight mb-1"
        >
          Celebrate with{' '}
          <span
            style={{ color: '#c47c5a', borderBottom: '2px solid #c47c5a' }}
            className="inline-block"
          >
            5% OFF
          </span>
        </h2>

        <p style={{ color: '#7a5c42' }} className="text-sm mb-5">
          Discount applied automatically · No code needed
        </p>

        {/* Countdown */}
        {timeLeft && (
          <div className="flex justify-center gap-2.5 mb-6">
            <CountdownBox value={timeLeft.days} label="Days" />
            <CountdownBox value={timeLeft.hrs}  label="Hrs"  />
            <CountdownBox value={timeLeft.mins} label="Mins" />
            <CountdownBox value={timeLeft.secs} label="Secs" />
          </div>
        )}

        <Link
          href="/products"
          style={{ background: '#3d2b1a', color: '#f5eee0' }}
          className="inline-block px-7 py-2.5 rounded-full text-sm font-semibold tracking-wide hover:opacity-90 transition-opacity"
        >
          Shop the Collection →
        </Link>
      </div>
    </section>
  )
}
