// components/discounted-price.tsx
'use client'

import { getDiscountedPrice } from '@/lib/utils/discount'

interface DiscountedPriceProps {
  price: number
  /** When true, shows "Starts at" prefix (for range-priced products on listing cards) */
  showStartsAt?: boolean
  className?: string
}

export default function DiscountedPrice({
  price,
  showStartsAt = false,
  className = '',
}: DiscountedPriceProps) {
  const { original, discounted, offer } = getDiscountedPrice(price)

  if (!offer) {
    return (
      <span className={`font-bold text-gray-900 ${className}`}>
        {showStartsAt && (
          <span className="text-xs font-medium text-gray-500 mr-1">Starts at</span>
        )}
        ₹{discounted.toFixed(0)}
      </span>
    )
  }

  return (
    <span className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      {showStartsAt && (
        <span className="text-xs font-medium text-gray-500">Starts at</span>
      )}
      <span className="text-[#a0896e] line-through text-sm">
        ₹{original.toFixed(0)}
      </span>
      <span className="font-bold text-[#c47c5a]">
        ₹{discounted.toFixed(0)}
      </span>
      <span className="bg-[#fef3ec] text-[#c47c5a] text-[10px] font-bold px-1.5 py-0.5 rounded-full">
        {offer.badgeText}
      </span>
    </span>
  )
}
