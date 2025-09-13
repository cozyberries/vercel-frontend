"use client";

import { useState, useEffect } from "react";
import { images } from "@/app/assets/images";
import Image from "next/image";
import Link from "next/link";
import { getCategories } from "@/lib/services/api";
import { getPrimaryCategoryImageUrl } from "@/lib/utils/product";

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  images?: Array<{
    id: string;
    storage_path: string;
    is_primary?: boolean;
    display_order?: number;
    metadata?: any;
    url?: string;
  }>;
}

export default function CategoryGrid() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await getCategories();
        setCategories(data);
      } catch (error) {
        console.error("Error fetching categories:", error);
        setCategories([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCategories();
  }, []);

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
      <div className="text-center p-8">
        <p className="text-gray-500">No categories available.</p>
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
