"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Percent, CheckCircle2, Sparkles, ArrowRight, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getActiveOffer } from "@/lib/utils/discount";

export default function OffersPage() {
  const router = useRouter();
  const offer = getActiveOffer();

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="text-cb-fg"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold text-cb-fg">Offers</h1>
      </div>

      {offer ? (
        <>
          <div className="rounded-2xl border border-cb-border bg-white p-5 max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cb-peach">
                <Percent className="h-5 w-5 text-cb-terracotta-deep" />
              </span>
              <div>
                <p className="text-[15px] font-bold text-cb-fg">
                  {offer.label} — {Math.round(offer.discountRate * 100)}% off
                </p>
                <p className="text-sm text-cb-muted-fg">On everything, sitewide</p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-cb-linen px-4 py-3 mb-4">
              <span className="text-sm font-bold tracking-wide text-cb-fg">{offer.code}</span>
              <span className="flex items-center gap-1 text-sm font-semibold text-cb-success">
                <CheckCircle2 className="h-4 w-4" />
                Active
              </span>
            </div>

            <p className="flex items-center gap-1.5 text-xs text-cb-muted-fg mb-4">
              <Sparkles className="h-3.5 w-3.5 text-cb-terracotta" />
              Auto-applied at cart — nothing to type at checkout.
            </p>

            <Button
              asChild
              className="w-full rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white h-12 text-[15px] font-semibold gap-1.5"
            >
              <Link href="/products">
                Shop with {Math.round(offer.discountRate * 100)}% off
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          <p className="text-center text-xs text-cb-muted-fg mt-4 max-w-md">
            One offer active at a time · applied to your whole cart
          </p>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
          <div className="mb-5 flex h-[70px] w-[70px] items-center justify-center rounded-full bg-cb-linen">
            <Tag className="h-7 w-7 text-cb-fg" />
          </div>
          <h2 className="text-lg font-semibold text-cb-fg mb-2">No offers right now</h2>
          <p className="text-sm text-cb-muted-fg">Check back soon for new deals.</p>
        </div>
      )}
    </div>
  );
}
