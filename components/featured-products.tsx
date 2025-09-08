"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFeaturedProducts, SimplifiedProduct } from "@/lib/services/api";

// Remove mock products data
// const products = [
//   {
//     id: 1,
//     name: "Organic Cotton Onesie",
//     price: 24.99,
//     image: "/placeholder.svg?height=400&width=400",
//     category: "Newborn",
//   },
//   {
//     id: 2,
//     name: "Soft Knit Baby Blanket",
//     price: 39.99,
//     image: "/placeholder.svg?height=400&width=400",
//     category: "Accessories",
//   },
//   {
//     id: 3,
//     name: "Ruffled Sleeve Dress",
//     price: 32.99,
//     image: "/placeholder.svg?height=400&width=400",
//     category: "Girl",
//   },
//   {
//     id: 4,
//     name: "Striped Romper Set",
//     price: 29.99,
//     image: "/placeholder.svg?height=400&width=400",
//     category: "Boy",
//   },
// ]

export default function FeaturedProducts() {
  const [products, setProducts] = useState<SimplifiedProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const featuredProducts = await getFeaturedProducts();
        setProducts(featuredProducts);
      } catch (error) {
        console.error("Error loading featured products:", error);
      } finally {
        setLoading(false);
      }
    };
    loadProducts();
  }, []);

  if (loading) {
    return <div className="text-center p-8">Loading featured products...</div>;
  }

  if (!products.length) {
    return <div className="text-center p-8">No featured products found.</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
      {products.map((product) => (
        <div key={product.id} className="group">
          <div className="relative mb-4 overflow-hidden bg-[#f5f5f5]">
            <Link href={`/products/${product.id}`}>
              <Image
                src={product.image || "/placeholder.svg"}
                alt={product.name}
                width={400}
                height={400}
                className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 bg-white/80 hover:bg-white rounded-full h-8 w-8"
            >
              <Heart className="h-4 w-4" />
              <span className="sr-only">Add to wishlist</span>
            </Button>
            <div className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" className="w-full rounded-none py-3">
                Add to Cart
              </Button>
            </div>
          </div>
          <div className="text-center">
            <h3 className="text-sm font-medium mb-1">
              <Link
                href={`/products/${product.id}`}
                className="hover:text-primary"
              >
                {product.name}
              </Link>
            </h3>
            <p className="text-sm text-muted-foreground mb-1">
              {product.category}
            </p>
            <p className="font-medium">${product.price.toFixed(2)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
