"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { images } from "@/app/assets/images";
import { getAgeOptions, type AgeOptionFilter } from "@/lib/services/api";

// Slug → image for known ages (DB-driven list; images are static assets)
const SLUG_TO_IMAGE: Record<string, string> = {
  "0-3m": images.age.age_zero_three_m,
  "0-3-months": images.age.age_zero_three_m,
  "3-6m": images.age.age_three_six_m,
  "3-6-months": images.age.age_three_six_m,
  "6-12m": images.age.age_six_twelve_m,
  "6-12-months": images.age.age_six_twelve_m,
  "1-2y": images.age.age_one_two_y,
  "1-2-years": images.age.age_one_two_y,
  "2-3y": images.age.age_two_three_y,
  "2-3-years": images.age.age_two_three_y,
  "3-6y": images.age.age_three_six_y,
  "3-6-years": images.age.age_three_six_y,
  "3-4y": images.age.age_three_six_y,
  "4-5y": images.age.age_three_six_y,
  "5-6y": images.age.age_three_six_y,
};

const FALLBACK_IMAGE = images.age.age_zero_three_m;

export default function AgeGrid() {
  const [ageOptions, setAgeOptions] = useState<AgeOptionFilter[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    getAgeOptions()
      .then((opts) => {
        setAgeOptions(opts);
      })
      .catch(() => {
        setAgeOptions([]);
      })
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="grid lg:grid-cols-6 md:grid-cols-3 grid-cols-3 gap-4 md:gap-6 lg:gap-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-full aspect-square bg-neutral-200 animate-pulse"
            aria-hidden
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-6 md:grid-cols-3 grid-cols-3 gap-4 md:gap-6 lg:gap-8">
      {ageOptions.map((age) => {
        const image = SLUG_TO_IMAGE[age.slug] ?? FALLBACK_IMAGE;
        return (
          <Link
            key={age.id}
            href={`/products?age=${encodeURIComponent(age.slug)}`}
            className="group relative overflow-hidden rounded-full aspect-square transition-all duration-500 hover:scale-105"
          >
            <div className="relative w-full h-full">
              <Image
                src={image}
                alt={age.name}
                fill
                sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 16vw"
                className="object-cover transition-all duration-700 ease-out scale-125 group-hover:scale-110 group-hover:rotate-12"
              />
              <div className="absolute inset-0 bg-black/5 group-hover:bg-black/30 transition-all duration-500 rounded-full" />

              {/* Swirl effect overlay */}
              <div className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/10 to-transparent transform rotate-45 group-hover:rotate-[405deg] transition-transform duration-1000 ease-out" />
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/5 to-transparent transform -rotate-45 group-hover:rotate-[315deg] transition-transform duration-1200 ease-out" />
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
