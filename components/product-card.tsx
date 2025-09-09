"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimplifiedProduct } from "@/lib/services/api";

interface ProductCardProps {
  product: SimplifiedProduct;
}

export default function ProductCard({ product }: ProductCardProps) {
  return (
    <div className="group">
      <div className="relative mb-4 overflow-hidden bg-[#f5f5f5] rounded-lg">
        {/* Product Image */}
        <Link href={`/products/${product.id}`}>
          <Image
            src={
              // product.image ||
              "https://thelittlebunny.in/cdn/shop/files/E83689CF-8048-436C-B8E4-0FEFB62F3BA8.jpg?v=1714489289"
            }
            alt={product.name}
            width={400}
            height={400}
            className="w-full h-auto object-cover transition-transform duration-300 lg:group-hover:scale-105"
          />
        </Link>

        {/* Wishlist Button (always visible) */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3 bg-white/90 hover:bg-white rounded-full h-9 w-9 shadow-md"
        >
          <Heart className="h-4 w-4" />
          <span className="sr-only">Add to wishlist</span>
        </Button>

        {/* Add to Cart Button (always visible on mobile, hover on desktop) */}
        <div className="absolute bottom-0 left-0 right-0">
          <Button
            variant="ghost"
            className="
              w-full rounded-none py-3 font-medium 
              bg-white/90 backdrop-blur-sm shadow-md
              md:opacity-0 md:group-hover:opacity-100 md:transition-opacity
            "
          >
            Add to Cart
          </Button>
        </div>
      </div>

      {/* Product Info */}
      <div className="text-center px-2">
        <h3 className="text-sm font-medium mb-1">
          <Link href={`/products/${product.id}`} className="hover:text-primary">
            {product.name}
          </Link>
        </h3>
        <p className="text-xs text-muted-foreground mb-1">{product.category}</p>
        <p className="font-medium text-sm">${product.price.toFixed(2)}</p>
      </div>
    </div>
  );
}
