"use client";

import Image from "next/image";
import Link from "next/link";

const ageRanges = [
  {
    id: "0-3m",
    name: "0-3 Months",
    slug: "0-3-months",
    description: "Newborn essentials",
    image: "/placeholder.jpg",
  },
  {
    id: "3-6m",
    name: "3-6 Months",
    slug: "3-6-months",
    description: "Growing baby comfort",
    image: "/placeholder.jpg",
  },
  {
    id: "6-12m",
    name: "6-12 Months",
    slug: "6-12-months",
    description: "Active crawler styles",
    image: "/placeholder.jpg",
  },
  {
    id: "1-2y",
    name: "1-2 Years",
    slug: "1-2-years",
    description: "Toddler adventures",
    image: "/placeholder.jpg",
  },
  {
    id: "2-3y",
    name: "2-3 Years",
    slug: "2-3-years",
    description: "Independent explorer",
    image: "/placeholder.jpg",
  },
  {
    id: "3-6y",
    name: "3-6 Years",
    slug: "3-6-years",
    description: "Little personality",
    image: "/placeholder.jpg",
  },
];

export default function AgeGrid() {
  return (
    <div className="grid lg:grid-cols-6 md:grid-cols-3 grid-cols-2 gap-6">
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
              className="object-cover transition-all duration-700 ease-out group-hover:scale-110 group-hover:rotate-12"
            />
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-all duration-500 rounded-full" />

            {/* Swirl effect overlay */}
            <div className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500">
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/10 to-transparent transform rotate-45 group-hover:rotate-[405deg] transition-transform duration-1000 ease-out" />
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/5 to-transparent transform -rotate-45 group-hover:rotate-[315deg] transition-transform duration-1200 ease-out" />
            </div>

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 z-10">
              <h3 className="text-white text-lg font-medium mb-1 drop-shadow-lg transition-all duration-300 group-hover:scale-105">
                {ageRange.name}
              </h3>
              <p className="text-white/90 text-sm drop-shadow-md transition-all duration-300 group-hover:scale-105">
                {ageRange.description}
              </p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
