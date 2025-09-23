"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimplifiedProduct } from "@/lib/services/api";
import { useWishlist } from "./wishlist-context";
import { toast } from "sonner";
import { images } from "@/app/assets/images";

interface FeaturedProductCardProps {
  product: SimplifiedProduct;
  index: number; // To determine which corner rounding to apply
}

export default function FeaturedProductCard({
  product,
  index,
}: FeaturedProductCardProps) {
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const inWishlist = isInWishlist(product.id);

  // Determine corner rounding based on index
  const getCornerRounding = () => {
    if (index % 2 === 0) {
      // Even index: rounded top-left and bottom-right
      return "rounded-tl-2xl rounded-br-2xl";
    } else {
      // Odd index: rounded top-right and bottom-left
      return "rounded-tr-2xl rounded-bl-2xl";
    }
  };

  return (
    <div
      key={product.id}
      className={`group flex flex-col h-full min-h-[400px] sm:min-h-[320px] lg:min-h-[320px] overflow-hidden bg-white transition-all duration-300 border border-gray-200/50 ${getCornerRounding()}`}
    >
      {/* Image Section */}
      <div
        className={`relative overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 h-[75%] `}
      >
        <Link href={`/products/${product.id}`}>
          <Image
            src={product.image || images.staticProductImage}
            alt={product.name}
            width={400}
            height={400}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        </Link>

        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Heart Icon Button for Wishlist */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 sm:top-4 sm:right-4 bg-white/90 hover:bg-white rounded-full h-7 w-7 sm:h-8 sm:w-8 shadow-md hover:shadow-lg transition-all duration-200"
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
                image: product.image,
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
            <Link href={`/products/${product.id}`}>Quick View</Link>
          </Button>
        </div>
      </div>

      {/* Content Section */}
      <div className="flex flex-col h-[25%] p-3 sm:p-3 lg:p-3 justify-between bg-white">
        {/* Product Info */}
        <div className="space-y-1">
          <h3 className="text-sm sm:text-sm lg:text-sm font-semibold text-gray-900 line-clamp-2 group-hover:text-primary transition-colors duration-200">
            <Link href={`/products/${product.id}`}>{product.name}</Link>
          </h3>
          {product.categoryName && product.categoryName !== "Uncategorized" && (
            <p className="text-xs text-gray-500 font-medium">
              {product.categoryName}
            </p>
          )}
        </div>

        {/* Price */}
        <div className="flex items-center justify-between">
          <p className="text-lg sm:text-lg lg:text-lg font-bold text-gray-900">
            ₹{product.price.toFixed(2)}
          </p>
          <Button
            asChild
            size="sm"
            className="bg-gray-900 hover:bg-gray-800 text-white text-sm px-4 py-2 sm:px-3 sm:py-1"
          >
            <Link href={`/products/${product.id}`}>View</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
