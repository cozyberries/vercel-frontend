"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Product } from "@/lib/services/api";
import { useWishlist } from "./wishlist-context";
import { toast } from "sonner";
import { images } from "@/app/assets/images";

interface ProductCardProps {
  product: Product;
  index: number; // To determine which corner rounding to apply
}

export default function ProductCard({ product }: ProductCardProps) {
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const inWishlist = isInWishlist(product.id);

  // Use consistent rounded corners for all cards
  const getCornerRounding = () => {
    return "rounded-2xl";
  };

  return (
    <div
      key={product.id}
      className={`group flex flex-col lg:min-h-[320px] min-h-[300px]  overflow-hidden bg-white transition-all duration-300 border border-gray-200/50 shadow-sm lg:hover:shadow-md ${getCornerRounding()}`}
    >
      {/* Image Section */}
      <div
        className={`relative overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 lg:h-[75%] h-[68%] `}
      >
        <Link href={`/products/${product.id}`}>
          {/* First Image */}
          <Image
            src={
              product.images?.[0] &&
              typeof product.images[0] === "string" &&
              product.images[0].trim() !== ""
                ? product.images[0]
                : images.staticProductImage
            }
            alt={product.name}
            width={400}
            height={400}
            className="w-full h-full object-cover transition-all duration-500 group-hover:scale-110 group-hover:opacity-0"
          />
          {/* Second Image (shown on hover if available) */}
          {product.images?.[1] &&
            typeof product.images[1] === "string" &&
            product.images[1].trim() !== "" && (
              <Image
                src={product.images[1]}
                alt={product.name}
                width={400}
                height={400}
                className="absolute inset-0 w-full h-full object-cover transition-all duration-500 opacity-0 group-hover:opacity-100 group-hover:scale-110"
              />
            )}
        </Link>

        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Heart Icon Button for Wishlist */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 sm:top-4 sm:right-4 bg-white/90 hover:bg-white rounded-full h-7 w-7 sm:h-8 sm:w-8 shadow-md hover:shadow-lg transition-all duration-200 opacity-0 group-hover:opacity-100 z-10"
          onClick={(e) => {
            e.preventDefault();
            if (inWishlist) {
              removeFromWishlist(product.id);
              toast.success(`${product.name} removed from wishlist!`);
            } else {
              addToWishlist({
                id: product.id,
                name: product.name,
                price: product.price,
                image: product.images?.[0],
              });
              toast.success(`${product.name} added to wishlist!`);
            }
          }}
        >
          <Heart
            className={`h-3 w-3 sm:h-4 sm:w-4 transition-colors duration-200 ${
              inWishlist
                ? "fill-red-500 text-red-500"
                : "text-gray-600 hover:text-red-500"
            }`}
          />
          <span className="sr-only">
            {inWishlist ? "Remove from wishlist" : "Add to wishlist"}
          </span>
        </Button>

        {/* Quick view overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <Button
            asChild
            size="sm"
            className="bg-white text-gray-900 hover:bg-gray-100 shadow-lg"
          >
            <Link href={`/products/${product.id}`}>View</Link>
          </Button>
        </div>
      </div>

      {/* Content Section */}
      <div className="flex flex-col lg:h-[25%] h-[32%] border p-1 lg:p-3 justify-between bg-white">
        {/* Product Info */}
        <div className="space-y-1">
          <h3 className="text-[.9rem] sm:text-sm lg:text-sm font-semibold text-gray-900 line-clamp-2 group-hover:text-primary transition-colors duration-200">
            <Link href={`/products/${product.id}`}>{product.name}</Link>
          </h3>
          {product.categories?.name && (
            <p className="text-xs text-gray-500 font-medium">
              {product.categories.name}
            </p>
          )}
        </div>

        {/* Price */}
        <div className="flex items-center justify-between">
          <p className="text-[.9rem] sm:text-sm lg:text-sm font-semibold text-gray-900 group-hover:text-primary transition-colors duration-200">
            ₹{product.price.toFixed(2)}
          </p>
        </div>
      </div>
    </div>
  );
}
