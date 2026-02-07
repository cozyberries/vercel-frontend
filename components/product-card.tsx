"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Product } from "@/lib/services/api";
import { useWishlist } from "./wishlist-context";
import { toast } from "sonner";
import { images } from "@/app/assets/images";

interface ProductCardProps {
  product: Product;
  index: number; // To determine which corner rounding to apply
}

export default function ProductCard({ product, index }: ProductCardProps) {
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const inWishlist = isInWishlist(product.id);

  // Use consistent rounded corners for all cards
  const getCornerRounding = () => {
    return "rounded-2xl";
  };

  const handleCardClick = () => {
    window.location.href = `/products/${product.id}`;
  };

  return (
    <div
      key={product.id}
      className={`group flex flex-col lg:min-h-[320px] min-h-[300px]  overflow-hidden bg-white transition-all duration-300 border border-gray-200/50 shadow-sm lg:hover:shadow-md cursor-pointer ${getCornerRounding()}`}
      onClick={handleCardClick}
    >
      {/* Image Section */}
      <div className={`relative overflow-hidden lg:h-[75%] h-[68%] `}>
        {/* Featured Badge */}
        {product.is_featured && (
          <span className="absolute top-2 left-2 sm:top-3 sm:left-3 z-10 bg-amber-500 text-white text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full shadow-md">
            Featured
          </span>
        )}
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
            priority={index < 4}
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

        {/* Quick view overlay
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <Button
            asChild
            size="sm"
            className=" text-gray-900 bg-none hover:bg-none p-10 shadow-lg"
          >
            <Link href={`/products/${product.id}`}>
              <Eye className="w-10 h-10" />
            </Link>
          </Button>
        </div> */}
      </div>

      {/* Content Section */}
      <div className="flex flex-col lg:h-[25%] h-[32%] border px-1 py-2 lg:px-3 lg:py-3 justify-between bg-white">
        {/* Product Info */}
        <div className="space-y-1">
          <h3 className="text-[13px] lg:text-[.9rem] font-semibold text-gray-900 line-clamp-2 group-hover:text-primary transition-colors duration-200">
            <Link href={`/products/${product.id}`}>{product.name}</Link>
          </h3>
        </div>

        {/* Category and Price */}
        <div className="flex items-center justify-between">
          {product.categories?.name && (
            <p className="text-xs text-gray-500 font-medium">
              {product.categories.name}
            </p>
          )}
          <p className="text-[13px] sm:text-sm lg:text-[.9rem] font-semibold text-gray-900 group-hover:text-primary transition-colors duration-200">
            ₹{product.price.toFixed(2)}
          </p>
        </div>
      </div>
    </div>
  );
}
