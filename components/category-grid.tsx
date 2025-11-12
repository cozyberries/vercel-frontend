"use client";

import Image from "next/image";
import Link from "next/link";
import { usePreloadedData } from "@/components/data-preloader";

// Static category images mapping
// const categoryImageMap: Record<string, string> = {
//   accessories: "/categories/accessories.jpg",
//   boy: "/categories/boy.jpg",
//   girl: "/categories/girl.jpg",
//   newborn: "/categories/newborn.jpg",
//   unisex: "/categories/unisex.webp",
//   // Add more mappings as needed
// };

export default function CategoryGrid() {
  const { categories, isLoading } = usePreloadedData();

  // Filter categories to show only those with display=true
  const displayCategories = categories.filter(
    (category) => category.display === true
  );

  console.log("displayCategories", displayCategories);

  if (isLoading) {
    return (
      <div className="grid lg:grid-cols-5 md:grid-cols-3 grid-cols-2 gap-4 md:gap-6 lg:gap-8">
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

  return (
    <div className="grid lg:grid-cols-5 md:grid-cols-3 grid-cols-2 gap-4 md:gap-6 lg:gap-8">
      {displayCategories.map((category) => {
        return (
          <Link
            key={category.id}
            href={`/products?category=${category.slug}`}
            className="group flex flex-col"
          >
            <div className="relative aspect-square overflow-hidden rounded-lg mb-3">
              <Image
                src={category.image || ""}
                alt={category.name}
                width={200}
                height={200}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
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
      })}
    </div>
  );
}
