"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { images } from "@/app/assets/images";

const HERO_IMAGES =
  images.heroImages.length > 0 ? images.heroImages : ["/placeholder.jpg"];
const FALLBACK_IMAGE = "/placeholder.jpg";

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

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % HERO_IMAGES.length);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 8000);
  };

  const prevSlide = () => {
    setCurrentIndex(
      (prev) => (prev - 1 + HERO_IMAGES.length) % HERO_IMAGES.length
    );
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 8000);
  };

  return (
    <section className="relative h-[500px] md:h-[600px] bg-[#f5eee0] overflow-hidden group">
      <div className="container mx-auto px-4 h-full flex items-center">
        <div className="max-w-xl z-10">
          <h1 className="text-3xl md:text-5xl font-light mb-4">
            Adorable Clothing for Your Little Treasures
          </h1>
          <p className="text-lg mb-8 text-muted-foreground">
            Crafted with love, designed for comfort, and made to last
          </p>
          <div className="flex gap-4">
            <Button asChild size="lg">
              <Link href="/products?type=new-arrivals">Shop New Arrivals</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/products?type=bestseller">Bestsellers</Link>
            </Button>
          </div>
        </div>

        {/* Image Carousel */}
        <div className="absolute right-0 bottom-0 w-full md:w-1/2 h-full overflow-hidden">
          <div
            className="flex h-full transition-transform duration-700 ease-in-out lg:opacity-100 opacity-65"
            style={{ transform: `translateX(-${currentIndex * 100}%)` }}
          >
            {HERO_IMAGES.map((src, index) => (
              <div key={src} className="w-full h-full flex-shrink-0 relative">
                <Image
                  src={imageErrors.has(index) ? FALLBACK_IMAGE : src}
                  alt="Baby clothing collection"
                  fill
                  sizes="50vw"
                  className="object-cover"
                  priority={index === 0}
                  onError={() => handleImageError(index)}
                />
              </div>
            ))}
          </div>

          {/* Navigation Arrows */}
          <button
            onClick={prevSlide}
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-gray-800 rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-lg"
            aria-label="Previous image"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>

          <button
            onClick={nextSlide}
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-gray-800 rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-lg"
            aria-label="Next image"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Modern Small Rounded Navigation Buttons */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-20">
        {HERO_IMAGES.map((src, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`w-3 h-3 rounded-full transition-all duration-300 ${
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
