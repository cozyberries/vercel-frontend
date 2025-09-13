"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { images } from "@/app/assets/images";

const HERO_IMAGES = images.heroImages.length > 0 ? images.heroImages : ["/placeholder.jpg"];
const FALLBACK_IMAGE = "/placeholder.jpg";

export default function Hero() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % HERO_IMAGES.length);
    }, 4000);
    return () => clearInterval(intervalId);
  }, []);

  const handleImageError = (index: number) => {
    setImageErrors(prev => new Set(prev).add(index));
  };

  return (
    <section className="relative h-[500px] md:h-[600px] bg-[#f5eee0] overflow-hidden">
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
        <div className="absolute right-0 bottom-0 w-full md:w-1/2 h-full ">
          <div className="relative w-full h-full lg:opacity-100 opacity-65">
            {HERO_IMAGES.map((src, index) => (
              <Image
                key={src}
                src={imageErrors.has(index) ? FALLBACK_IMAGE : src}
                alt="Baby clothing collection"
                fill
                sizes="50vw"
                className={`object-cover transition-opacity duration-700 ease-in-out ${
                  index === currentIndex ? "opacity-100" : "opacity-0"
                }`}
                priority={index === 0}
                onError={() => handleImageError(index)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
