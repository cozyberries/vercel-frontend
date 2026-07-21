"use client";

import { getActiveOffer } from "@/lib/utils/discount";

export default function PromoPill() {
  const offer = getActiveOffer();
  if (!offer) return null;

  return (
    <div className="container mx-auto px-4 pt-4">
      <div className="mx-auto flex max-w-3xl items-center gap-2 rounded-2xl bg-cb-peach px-4 py-2.5 text-cb-terracotta-deep">
        <span aria-hidden>✨</span>
        <span className="text-[11px] sm:text-sm font-semibold whitespace-nowrap truncate">
          {offer.label} — {Math.round(offer.discountRate * 100)}% off · auto-applied
        </span>
        <span className="ml-auto shrink-0 rounded-full bg-cb-terracotta-deep px-2 py-0.5 text-[10px] sm:text-xs font-bold text-white">
          {offer.code}
        </span>
      </div>
    </div>
  );
}
