"use client";

import Image from "next/image";
import Link from "next/link";
import { images } from "@/app/assets/images";

const ageRanges = [
  {
    id: "0-3m",
    name: "0-3 Months",
    slug: "0-3-months",
    description: "Newborn essentials",
    image: images.age.age_zero_three_m,
  },
  {
    id: "3-6m",
    name: "3-6 Months",
    slug: "3-6-months",
    description: "Growing baby comfort",
    image: images.age.age_three_six_m,
  },
  {
    id: "6-12m",
    name: "6-12 Months",
    slug: "6-12-months",
    description: "Active crawler styles",
    image: images.age.age_six_twelve_m,
  },
  {
    id: "1-2y",
    name: "1-2 Years",
    slug: "1-2-years",
    description: "Toddler adventures",
    image: images.age.age_one_two_y,
  },
  {
    id: "2-3y",
    name: "2-3 Years",
    slug: "2-3-years",
    description: "Independent explorer",
    image: images.age.age_two_three_y,
  },
  {
    id: "3-6y",
    name: "3-6 Years",
    slug: "3-6-years",
    description: "Little personality",
    image: images.age.age_three_six_y,
  },
];

export default function AgeGrid() {
  return (
    <div className="container mx-auto grid lg:grid-cols-6 md:grid-cols-3 grid-cols-3 gap-4 md:gap-6 lg:gap-8">
      {ageRanges.map((ageRange) => (
        <Link
          key={ageRange.id}
          href={`/products?age=${ageRange.slug}`}
          className="group relative overflow-hidden rounded-full aspect-square transition-all duration-500 hover:scale-105"
        >
          <div className="relative w-full h-full">
            <Image
              src={ageRange.image}
              alt={ageRange.name}
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
      ))}
    </div>
  );
}
