"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { images } from "@/app/assets/images";

// Hero images
const HERO_IMAGES = images.heroImages;
const MOBILE_IMAGES = images.mobileHeroImages;
const FALLBACK_IMAGE = "/placeholder.jpg";
const SWIPE_THRESHOLD_PX = 50;

// Slide copy, indexed to match heroImages/mobileHeroImages order (gifting, gentle-at-home, texture)
const HERO_COPY = [
  { eyebrow: "New Season", title: "Soft Beginnings,\nWrapped in Love", cta: "Shop gifting" },
  { eyebrow: "Gentle at home", title: "Made for\nTiny Moments", cta: "Shop everyday" },
  { eyebrow: "100% Organic Muslin", title: "Light as Air,\nKind to Skin", cta: "Feel the muslin" },
];

export default function Hero() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  // Mobile-first: the server renders the phone hero so the h1 and the LCP image are in the static
  // HTML; desktop viewports swap image sets after hydration. (A null "detecting" state shipped an
  // empty box in the HTML instead.)
  const [isMobile, setIsMobile] = useState<boolean>(true);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  // Detect mobile once on mount — avoids rendering both desktop and mobile images
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Choose the correct image list based on viewport
  const heroImages = useMemo(
    () => (isMobile ? MOBILE_IMAGES : HERO_IMAGES),
    [isMobile],
  );

  // Clamp currentIndex when image list length changes (prevents out-of-bounds on viewport resize)
  // Uses functional updater so currentIndex is not a dependency (avoids running on every slide advance)
  useEffect(() => {
    if (heroImages.length > 0) {
      setCurrentIndex((prev) => Math.min(prev, heroImages.length - 1));
    }
  }, [heroImages.length]);

  useEffect(() => {
    if (!isAutoPlaying || heroImages.length === 0) return;

    const intervalId = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % heroImages.length);
    }, 4000);
    return () => clearInterval(intervalId);
  }, [isAutoPlaying, heroImages.length]);

  const handleImageError = (index: number) => {
    setImageErrors((prev) => new Set(prev).add(index));
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
    setIsAutoPlaying(false);
    // Resume auto-play after 8 seconds
    setTimeout(() => setIsAutoPlaying(true), 8000);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = touch.clientY - touchStartY.current;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return;
    if (Math.abs(deltaX) < Math.abs(deltaY)) return;

    const len = heroImages.length;
    const idx = currentIndexRef.current;
    if (deltaX < 0) {
      goToSlide((idx + 1) % len);
    } else {
      goToSlide((idx - 1 + len) % len);
    }
  };

  return (
    <section className="container mx-auto px-4 pt-4">
      <div className="relative h-[380px] md:h-[500px] rounded-[22px] overflow-hidden group">
        {/* Image Carousel */}
        <div
          className="absolute inset-0 w-full h-full overflow-hidden touch-pan-y"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="flex h-full transition-transform duration-700 ease-in-out"
            style={{ transform: `translateX(-${currentIndex * 100}%)` }}
          >
            {heroImages.map((src, index) => (
              <div key={src} className="w-full h-full flex-shrink-0 relative">
                <Image
                  src={imageErrors.has(index) ? FALLBACK_IMAGE : src}
                  alt="Baby clothing collection"
                  fill
                  /* Mobile gets ~100vw, desktop caps at 1920 */
                  sizes={
                    isMobile
                      ? "100vw"
                      : "(max-width: 1200px) 100vw, 1920px"
                  }
                  className="object-cover"
                  priority={index === 0}
                  loading={index === 0 ? "eager" : "lazy"}
                  onError={() => handleImageError(index)}
                />
              </div>
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
        </div>

        {/* Slide copy + CTA — left-aligned, same treatment at every breakpoint */}
        <div className="absolute left-5 right-5 md:left-10 md:right-10 bottom-6 md:bottom-8 z-10 text-white">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/90">
            {HERO_COPY[currentIndex]?.eyebrow}
          </p>
          <h1 className="mb-4 whitespace-pre-line text-[28px] md:text-[32px] font-light leading-[1.12] [text-shadow:0_1px_12px_rgba(0,0,0,0.25)]">
            {HERO_COPY[currentIndex]?.title}
          </h1>
          <Button
            asChild
            size="lg"
            className="bg-cb-terracotta text-white border-0 shadow-lg hover:bg-cb-terracotta-deep transition-colors duration-300 rounded-full px-6 h-11 text-sm font-medium"
          >
            <Link href="/products">
              {HERO_COPY[currentIndex]?.cta ?? "Shop Now"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* Slide indicators — top-right dot/pill */}
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
          {heroImages.map((src, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`h-[7px] rounded-full transition-all duration-300 ${
                index === currentIndex
                  ? "w-[22px] bg-white"
                  : "w-[7px] bg-white/55 hover:bg-white/80"
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}