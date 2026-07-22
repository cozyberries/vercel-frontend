"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Wind, Leaf, Shield, Recycle, MapPin, Clock, ShoppingBag, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import WhyMuslinSection from "@/components/why-muslin-section";
import SustainabilitySection from "@/components/sustainability-section";
import { images } from "@/app/assets/images";

const VALUES = [
  {
    icon: Wind,
    title: "Naturally breathable",
    description: "Soft, airy muslin that keeps little ones comfortable.",
  },
  {
    icon: Leaf,
    title: "100% organic cotton",
    description: "Grown without harmful pesticides, gentle on skin.",
  },
  {
    icon: Shield,
    title: "No harsh chemicals",
    description: "Azo-free dyes, no formaldehyde, no heavy metals.",
  },
  {
    icon: Recycle,
    title: "Small batches",
    description: "Mindful production that respects Mother Earth.",
  },
];

export default function AboutPage() {
  const router = useRouter();

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="text-cb-fg"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold text-cb-fg">Our Story</h1>
      </div>

      {/* Hero */}
      <div className="relative h-[280px] md:h-[380px] rounded-2xl overflow-hidden mb-6">
        <Image
          src={images.heroImages[0]}
          alt="CozyBerries — Soft Beginnings, Wrapped in Love"
          fill
          sizes="(max-width: 768px) 100vw, 768px"
          className="object-cover"
          priority
        />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
        <div className="absolute left-5 right-5 bottom-6 z-10 text-white">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/90">
            Our Story
          </p>
          <h2 className="text-[26px] md:text-[32px] font-light leading-[1.15]">
            Soft Beginnings,
            <br />
            Wrapped in Love
          </h2>
        </div>
      </div>

      <div className="space-y-4 mb-8">
        <p className="text-sm text-cb-muted-fg leading-relaxed">
          CozyBerries began in Bangalore with a simple belief: a baby&apos;s first clothes should be as gentle as
          the world they&apos;re welcomed into. So we chose one fabric we trust completely — 100% organic
          muslin — and built everything around it.
        </p>
        <p className="text-sm text-cb-muted-fg leading-relaxed">
          Every piece is cut, stitched and finished in small batches in India, with azo-free dyes and smooth,
          gentle seams that protect even the most delicate newborn skin. No shortcuts, no harsh chemicals —
          just everyday essentials made to be lived in, washed often, and loved soft.
        </p>
      </div>

      {/* Value cards */}
      <div className="grid grid-cols-2 gap-3 mb-10">
        {VALUES.map((v) => (
          <div key={v.title} className="rounded-xl bg-cb-linen p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white mb-2">
              <v.icon className="h-4 w-4 text-cb-terracotta-deep" />
            </span>
            <h3 className="text-sm font-semibold text-cb-fg mb-0.5">{v.title}</h3>
            <p className="text-xs text-cb-muted-fg leading-snug">{v.description}</p>
          </div>
        ))}
      </div>

      <div className="-mx-4">
        <WhyMuslinSection />
        <SustainabilitySection />
      </div>

      {/* Visit us / hours */}
      <div className="rounded-2xl bg-cb-linen p-5 space-y-4 mb-6">
        <div className="flex items-start gap-3">
          <MapPin className="h-4 w-4 text-cb-terracotta-deep shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-cb-fg">Visit us</p>
            <p className="text-sm text-cb-muted-fg">RT Nagar, Bangalore – 560032</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Clock className="h-4 w-4 text-cb-terracotta-deep shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-cb-fg">We&apos;re around</p>
            <p className="text-sm text-cb-muted-fg">9:00 AM – 9:00 PM IST</p>
          </div>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        <Button
          asChild
          className="w-full rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white h-12 text-[15px] font-semibold gap-2"
        >
          <Link href="/products">
            <ShoppingBag className="h-4 w-4" />
            Shop the collection
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="w-full rounded-full border-cb-border h-12 text-[15px] font-semibold gap-2"
        >
          <Link href="/contact">
            <LifeBuoy className="h-4 w-4" />
            Contact &amp; support
          </Link>
        </Button>
      </div>

      <p className="text-center text-sm text-cb-muted-fg mb-6">
        Soft beginnings, wrapped in love 🌿
      </p>
    </div>
  );
}
