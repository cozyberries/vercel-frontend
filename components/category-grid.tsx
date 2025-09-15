"use client";

import { images } from "@/app/assets/images";
import Image from "next/image";
import Link from "next/link";
import { getPrimaryCategoryImageUrl } from "@/lib/utils/product";
import { usePreloadedData } from "@/components/data-preloader";

export default function CategoryGrid() {
  const { categories, isLoading } = usePreloadedData();

  if (isLoading) {
    return (
      <div className="grid lg:grid-cols-5 grid-cols-3 gap-8">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="aspect-square bg-gray-200 animate-pulse rounded-lg"
          />
        ))}
      </div>
    );
  }

  if (!categories.length) {
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
    <div className="grid lg:grid-cols-5 grid-cols-3 gap-8">
      {categories.map((category) => {
        // Use dynamic category image if available, otherwise fallback to placeholder
        let categoryImage = images.staticCategoryImage;
        try {
          const dynamicImage = getPrimaryCategoryImageUrl(category.images);
          if (dynamicImage) {
            categoryImage = dynamicImage;
          }
        } catch (error) {
          console.warn('Error getting category image for', category.name, error);
          // categoryImage already set to fallback
        }

        return (
          <Link
            key={category.id}
            href={`/products?category=${category.slug}`}
            className="group relative overflow-hidden lg:rounded-lg rounded-full"
          >
            <div className="aspect-square overflow-hidden">
              <Image
                src={categoryImage}
                alt={category.name}
                width={200}
                height={200}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
              <h3 className="text-white text-xl font-medium">
                {category.name}
              </h3>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
