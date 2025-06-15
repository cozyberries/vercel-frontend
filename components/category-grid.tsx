"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { getCategories } from "@/lib/supabase"

export default function CategoryGrid() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const cats = await getCategories();
        setCategories(cats);
      } catch (error) {
        console.error("Error loading categories:", error);
        setCategories([]);
      } finally {
        setLoading(false);
      }
    };
    loadCategories();
  }, []);

  if (loading) {
    return <div className="text-center p-8">Loading categories...</div>;
  }

  if (!categories.length) {
    return <div className="text-center p-8">No categories found.</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
      {categories.map((category) => (
        <Link
          key={category.id || category.name}
          href={category.slug ? `/products?category=${category.slug}` : `/products?category=${category.name?.toLowerCase()}`}
          className="group relative overflow-hidden rounded-lg"
        >
          <div className="aspect-square overflow-hidden">
            <Image
              src={category.image || "/placeholder.svg?height=400&width=400"}
              alt={category.name}
              width={400}
              height={400}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </div>
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
            <h3 className="text-white text-xl font-medium">{category.name}</h3>
          </div>
        </Link>
      ))}
    </div>
  );
}

