// components/discounted-price.tsx
'use client'

import { getDiscountedPrice } from '@/lib/utils/discount'

interface DiscountedPriceProps {
  price: number
  /** When true, shows "Starts at" prefix (for range-priced products on listing cards) */
  showStartsAt?: boolean
  className?: string
  /** PDP: MRP (strikethrough) + large payable price + badge on one row */
  variant?: 'default' | 'hero'
}

export default function DiscountedPrice({
  price,
  showStartsAt = false,
  className = '',
  variant = 'default',
}: DiscountedPriceProps) {
  const { original, discounted, offer } = getDiscountedPrice(price)

  if (!offer) {
    const singleClass =
      variant === 'hero'
        ? `text-4xl sm:text-5xl font-bold text-gray-900 tracking-tight tabular-nums ${className}`
        : `font-bold text-gray-900 ${className}`
    return (
      <span className={singleClass}>
        {showStartsAt && (
          <span className="text-xs font-medium text-gray-500 mr-1">Starts at</span>
        )}
        ₹{discounted.toFixed(0)}
      </span>
    )
  }

  if (variant === 'hero') {
    return (
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
        {showStartsAt && (
          <span className="text-xs font-medium text-gray-500 w-full">Starts at</span>
        )}
        <span className="text-[#a0896e] line-through text-sm sm:text-base tabular-nums shrink-0">
          ₹{original.toFixed(0)}
        </span>
        <span className="text-3xl sm:text-4xl md:text-5xl font-bold text-[#c47c5a] tracking-tight tabular-nums">
          ₹{discounted.toFixed(0)}
        </span>
        <span className="bg-[#fef3ec] text-[#c47c5a] text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
          {offer.badgeText}
        </span>
      </div>
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
