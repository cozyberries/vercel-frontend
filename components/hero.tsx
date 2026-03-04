"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { images } from "@/app/assets/images";

// Hero images - using desktop images as default for SSR consistency
const HERO_IMAGES = images.heroImages;
const FALLBACK_IMAGE = "/placeholder.jpg";

// Mobile image sources
const MOBILE_IMAGES = images.mobileHeroImages;

const getMobileImageSrc = (index: number) => {
  return MOBILE_IMAGES[index] || FALLBACK_IMAGE;
};

export default function Hero() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  useEffect(() => {
    if (!isAutoPlaying) return;

    const intervalId = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % HERO_IMAGES.length);
    }, 4000);
    return () => clearInterval(intervalId);
  }, [isAutoPlaying]);

  const handleImageError = (index: number) => {
    setImageErrors((prev) => new Set(prev).add(index));
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
    setIsAutoPlaying(false);
    // Resume auto-play after 8 seconds
    setTimeout(() => setIsAutoPlaying(true), 8000);
  };

  return (
    <section className="relative h-[70vh] md:h-[700px] bg-[#f5eee0] overflow-hidden group">
      {/* Image Carousel - Full Width Background */}
      <div className="absolute inset-0 w-full h-full overflow-hidden">
        <div
          className="flex h-full transition-transform duration-700 ease-in-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {HERO_IMAGES.map((src, index) => (
            <div key={src} className="w-full h-full flex-shrink-0 relative">
              {/* Desktop Image */}
              <Image
                src={imageErrors.has(index) ? FALLBACK_IMAGE : src}
                alt="Baby clothing collection"
                fill
                sizes="100vw"
                className="object-cover hidden md:block"
                priority={index === 0}
                onError={() => handleImageError(index)}
              />
              {/* Mobile Image */}
              <Image
                src={
                  imageErrors.has(index)
                    ? FALLBACK_IMAGE
                    : getMobileImageSrc(index)
                }
                alt="Baby clothing collection"
                fill
                sizes="100vw"
                className="object-cover block md:hidden"
                priority={index === 0}
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
        {HERO_IMAGES.map((src, index) => (
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
