"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { images } from "@/app/assets/images";

// Hero images
const HERO_IMAGES = images.heroImages;
const MOBILE_IMAGES = images.mobileHeroImages;
const FALLBACK_IMAGE = "/placeholder.jpg";
const SWIPE_THRESHOLD_PX = 50;

export default function Hero() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
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

  useEffect(() => {
    if (!isAutoPlaying) return;

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

  // While we haven't detected mobile/desktop yet, show a neutral skeleton
  // to avoid downloading the wrong image set
  if (isMobile === null) {
    return (
      <section className="relative h-[70vh] md:h-[700px] bg-[#f5eee0] overflow-hidden" />
    );
  }

  return (
    <section className="relative h-[70vh] md:h-[700px] bg-[#f5eee0] overflow-hidden group">
      {/* Image Carousel - Full Width Background */}
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
        <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/30 to-transparent lg:from-black/20" />
      </div>

      {/* CTA Button */}
      <div className="absolute inset-x-0 bottom-16 flex justify-center z-10">
        <Button
          asChild
          size="lg"
          className="bg-white/70 text-gray-900 border-0 shadow-lg hover:shadow-xl hover:bg-white/90 hover:scale-105 transition-[transform,box-shadow,background-color] duration-300 rounded-full px-8 h-11 text-sm font-medium backdrop-blur-sm"
        >
          <Link href="/products">Shop Now</Link>
        </Button>
      </div>

      {/* Modern Small Rounded Navigation Buttons */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20">
        {heroImages.map((src, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`w-3 h-3 rounded-full transition-[transform,background-color] duration-300 ${
              index === currentIndex
                ? "bg-white shadow-lg scale-125"
                : "bg-white/50 hover:bg-white/80 hover:scale-110"
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </section>
  );
}