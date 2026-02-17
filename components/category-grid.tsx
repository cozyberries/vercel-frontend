"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePreloadedData } from "@/components/data-preloader";
import { toImageSrc, PLACEHOLDER_DATA_URL } from "@/lib/utils/image";

/** Category shape used for display and image resolution (image/images may be string or object with url). */
interface Category {
  id: string;
  name: string;
  slug?: string;
  display?: boolean;
  image?: string | { url?: string };
  images?: { url?: string }[];
}

// Slugs to hide from homepage "Shop by Category" (configurable via env or props)
const DEFAULT_HIDE_FROM_HOMEPAGE_SLUGS = ["newborn-essentials", "newborn-clothing"];
const HIDE_FROM_HOMEPAGE_SLUGS = process.env.NEXT_PUBLIC_HIDE_CATEGORY_SLUGS
  ? process.env.NEXT_PUBLIC_HIDE_CATEGORY_SLUGS.split(",").map(s => s.trim())
  : DEFAULT_HIDE_FROM_HOMEPAGE_SLUGS;

export default function CategoryGrid() {
  const { categories, isLoading } = usePreloadedData();

  // Filter categories: display=true and not in the separate newborn section
  const displayCategories = categories.filter(
    (category) =>
      category.display === true &&
      !HIDE_FROM_HOMEPAGE_SLUGS.includes(category.slug ?? "")
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
        {Array.from({ length: 10 }).map((_, index) => (
          <div
            key={index}
            className="aspect-square bg-gray-200 animate-pulse rounded-lg"
          />
        ))}
      </div>
    );
  }

  if (!displayCategories.length) {
    return (
      <div className="text-center py-12">
        <div className="max-w-sm mx-auto">
          <div className="mb-4">
            <svg
              className="mx-auto h-16 w-16 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No categories available
          </h3>
          <p className="text-gray-500">
            Product categories will appear here once they are added.
          </p>
        </div>
      </div>
    );
  }

  const getCategoryImageSrc = (category: Category): string => {
    const fromRaw = toImageSrc(category.image);
    if (fromRaw !== PLACEHOLDER_DATA_URL) return fromRaw;
    const first = category.images?.[0];
    return toImageSrc(first?.url ?? first);
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
      {displayCategories.map((category) => {
        const imageSrc = getCategoryImageSrc(category);
        return (
          <CategoryCard
            key={category.id}
            category={category}
            imageSrc={imageSrc}
          />
        );
      })}
    </div>
  );
}

function CategoryCard({
  category,
  imageSrc,
}: {
  category: { id: string; name: string; slug?: string };
  imageSrc: string;
}) {
  const [src, setSrc] = useState(imageSrc);
  useEffect(() => {
    setSrc(imageSrc);
  }, [imageSrc]);
  const isPlaceholder = src === PLACEHOLDER_DATA_URL || src.startsWith("data:");

  return (
    <Link
      href={`/products?category=${category.slug}`}
      className="group flex flex-col"
    >
      <div className="relative aspect-square overflow-hidden rounded-lg mb-3">
        <Image
          src={src}
          alt={category.name}
          width={200}
          height={200}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={() => {
            if (!isPlaceholder) {
              setSrc(PLACEHOLDER_DATA_URL);
            }
          }}
        />
        <div className="absolute inset-0 bg-black/5 group-hover:bg-black/30 transition-all duration-500" />
      </div>
      <div className="text-center">
        <h3 className="text-gray-900 text-sm md:text-base lg:text-lg font-medium group-hover:text-primary transition-colors">
          {category.name}
        </h3>
      </div>
    </Link>
  );
}
