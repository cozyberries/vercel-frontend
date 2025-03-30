"use client"

import { useState } from "react"
import { X } from "lucide-react"

export default function PromoBar() {
  const [isVisible, setIsVisible] = useState(true)

  if (!isVisible) return null

  return (
    <div className="bg-[#e8e3d7] text-center py-2 px-4 relative">
      <p className="text-sm">Limited Time Offer: Use Code &apos;WELCOME15&apos; To Get 15% off Site-Wide</p>
      <button
        onClick={() => setIsVisible(false)}
        className="absolute right-4 top-1/2 transform -translate-y-1/2"
        aria-label="Close promotion"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

