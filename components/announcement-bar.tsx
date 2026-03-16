// components/announcement-bar.tsx
'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { getActiveOffer } from '@/lib/utils/discount'

export default function AnnouncementBar() {
  const offer = getActiveOffer()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!offer) return
    const dismissed = localStorage.getItem(`announcement-dismissed-${offer.code}`)
    if (!dismissed) setVisible(true)
  }, [offer?.code])

  if (!offer || !visible) return null

  const handleDismiss = () => {
    localStorage.setItem(`announcement-dismissed-${offer.code}`, '1')
    setVisible(false)
  }

  return (
    <div
      style={{ background: '#c9a87c' }}
      className="w-full py-2 px-4 flex items-center justify-center gap-3 relative"
    >
      <p
        style={{ color: '#3d2b1a' }}
        className="text-sm font-medium text-center leading-tight"
      >
        🌿 {offer.label} —{' '}
        <strong>{Math.round(offer.discountRate * 100)}% off all products</strong>
        {' · '}
        <span
          style={{ background: '#3d2b1a', color: '#f5eee0' }}
          className="text-xs font-bold px-2 py-0.5 rounded-full inline-block mx-0.5"
        >
          {offer.code}
        </span>
        {' '}applied automatically
      </p>
      <button
        onClick={handleDismiss}
        style={{ color: '#3d2b1a' }}
        className="absolute right-3 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss announcement"
      >
        <X size={14} />
      </button>
    </div>
  )
}
