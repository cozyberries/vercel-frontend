"use client";

import Image from "next/image";
import Link from "next/link";
import { images } from "@/app/assets/images";
import { useAgeOptions } from "@/hooks/useApiQueries";

// Slug → image for known ages (DB-driven list; images are static assets)
// 3-4y, 4-5y, 5-6y combined into 3-6 in UI; one image for 3-6
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
  const { data: ageOptions = [], isLoading, error } = useAgeOptions();

  if (isLoading) {
    return (
      <div className="flex gap-3.5 overflow-x-auto lg:justify-between lg:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="w-[104px] h-[104px] lg:w-[118px] lg:h-[118px] shrink-0 rounded-full bg-neutral-200 animate-pulse"
            aria-hidden
          />
        ))}
      </div>
    );
  }

  if (error) {
    console.error("Error loading age options:", error);
    return (
      <div className="text-center py-8">
        <p className="text-neutral-500">Unable to load age options. Please try refreshing the page.</p>
      </div>
    );
  }

  return (
    <div className="flex gap-3.5 overflow-x-auto lg:justify-between lg:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {ageOptions.map((age) => {
        const image = SLUG_TO_IMAGE[age.slug] ?? FALLBACK_IMAGE;
        return (
          <Link
            key={age.id}
            href={`/products?age=${encodeURIComponent(age.slug)}`}
            className="w-[104px] h-[104px] lg:w-[118px] lg:h-[118px] shrink-0 overflow-hidden rounded-full active:scale-[0.98] transition-transform duration-150"
          >
            <Image
              src={image}
              alt={age.name}
              width={118}
              height={118}
              sizes="118px"
              className="w-full h-full object-cover"
            />
          </Link>
        );
      })}
    </div>
  );
}
