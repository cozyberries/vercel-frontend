import { getDiscountedPrice } from "@/lib/utils/discount";

interface DisplayPriceProps {
  price: number;
  /** "Starts at" prefix for products whose sizes are priced differently. */
  showStartsAt: boolean;
}

/**
 * Same pricing rule as the product card's DiscountedPrice, sized for a TV across a room: every part
 * (including "Starts at" and the offer badge) scales with the screen instead of fixed rem sizes.
 */
export default function DisplayPrice({ price, showStartsAt }: DisplayPriceProps) {
  const { original, discounted, offer } = getDiscountedPrice(price);
  return (
    <div className="mt-[1.5vmin] flex flex-wrap items-baseline gap-x-[1.5vmin] gap-y-[0.5vmin]">
      {showStartsAt && (
        <span className="w-full text-[max(12px,2vmin)] font-medium text-[#6b5443]">Starts at</span>
      )}
      {offer && (
        <span className="text-[max(14px,2.8vmin)] tabular-nums text-[#a0896e] line-through">
          ₹{original.toFixed(0)}
        </span>
      )}
      <span
        className={`text-[max(24px,6vmin)] font-bold tabular-nums tracking-tight ${offer ? "text-[#c47c5a]" : "text-[#4a3426]"}`}
      >
        ₹{discounted.toFixed(0)}
      </span>
      {offer && (
        <span className="rounded-full bg-[#fef3ec] px-[1.2vmin] py-[0.4vmin] text-[max(12px,2vmin)] font-bold text-[#c47c5a]">
          {offer.badgeText}
        </span>
      )}
    </div>
  );
}
