"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { getProductImageUrl } from "@/lib/supabase"

const categories = [
  {
    name: "Newborn",
    image: "/placeholder.svg?height=400&width=400",
    href: "/collections/newborn",
  },
  {
    name: "Girl",
    image: "/placeholder.svg?height=400&width=400",
    href: "/collections/girl",
  },
  {
    name: "Boy",
    image: "/placeholder.svg?height=400&width=400",
    href: "/collections/boy",
  },
  {
    name: "Accessories",
    image: "/placeholder.svg?height=400&width=400",
    href: "/collections/accessories",
  },
]

export default function CategoryGrid() {
  const [imageUrl, setImageUrl] = useState("/placeholder.svg");

  useEffect(() => {
    const loadImage = async () => {
      try {
        const url = await getProductImageUrl();
        setImageUrl(url);
      } catch (error) {
        console.error("Error loading image:", error);
      }
    };
    loadImage();
  }, []);
  
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
      {categories.map((category) => (
        <Link key={category.name} href={category.href} className="group relative overflow-hidden rounded-lg">
          <div className="aspect-square overflow-hidden">
            <Image
              src={imageUrl}
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
  )
}

