"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Product, SizeOption } from "@/lib/services/api";
import { useWishlist } from "./wishlist-context";
import { useCart } from "./cart-context";
import { toast } from "sonner";
import { images } from "@/app/assets/images";

interface ProductCardProps {
  product: Product;
  index: number; // Used to set image loading priority (e.g. priority for first N images); not used by getCornerRounding()
}

export default function ProductCard({ product, index }: ProductCardProps) {
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { addToCart } = useCart();
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
      {/* Image Section - larger on mobile and desktop */}
      <div className={`relative overflow-hidden lg:h-[78%] h-[72%]`}>
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

        {/* Wishlist top-left, Add to cart top-right (visible on mobile; on desktop show on hover) */}
        <div className="absolute top-2 left-2 right-2 z-10 flex justify-between items-start pointer-events-none md:pointer-events-auto md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-white/90 hover:bg-white shadow-md hover:shadow-lg pointer-events-auto border-0"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
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
            aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
          >
            <Heart
              className={`h-4 w-4 sm:h-5 sm:w-5 transition-colors duration-200 ${
                inWishlist
                  ? "fill-red-500 text-red-500"
                  : "text-gray-600 hover:text-red-500"
              }`}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-white/90 hover:bg-white shadow-md hover:shadow-lg pointer-events-auto border-0"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              addToCart({
                id: product.id,
                name: product.name,
                price: product.price,
                image: product.images?.[0],
                quantity: 1,
              });
              toast.success(`${product.name} added to cart!`);
            }}
            aria-label="Add to cart"
          >
            <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5 text-gray-700" />
          </Button>
        </div>

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

      {/* Content Section - compact, smaller text, no extra spacing */}
      <div className="flex flex-col lg:h-[22%] h-[28%] min-h-0 border px-1 py-1 lg:px-3 lg:py-2 justify-between bg-white gap-0">
        {/* Product title - slider with enough height so title is visible above scrollbar */}
        <div
          className="flex min-h-[1.375rem] flex-shrink-0 overflow-x-auto overflow-y-hidden scroll-smooth -mx-0.5 px-0.5 pt-0 pb-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full"
          style={{ WebkitOverflowScrolling: "touch" }}
          onClick={(e) => e.stopPropagation()}
          role="region"
          aria-label="Product name"
        >
          <h3 className="shrink-0 text-[10px] sm:text-[12px] lg:text-[.85rem] font-semibold text-gray-900 whitespace-nowrap leading-tight group-hover:text-primary transition-colors duration-200">
            <Link href={`/products/${product.id}`}>{product.name}</Link>
          </h3>
        </div>

        {/* Available Sizes - horizontal slider, no top/bottom margin */}
        {product.sizes && product.sizes.length > 0 && (
          <div
            className="flex gap-1 items-center flex-shrink-0 overflow-x-auto overflow-y-hidden scroll-smooth pb-0.5 -mx-0.5 px-0.5 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full"
            style={{ WebkitOverflowScrolling: "touch" }}
            onClick={(e) => e.stopPropagation()}
            role="region"
            aria-label="Available sizes"
          >
            {product.sizes.map((size: SizeOption) => (
              <span
                key={size.name}
                className={`shrink-0 text-[9px] lg:text-[10px] px-1 py-0.5 rounded border whitespace-nowrap ${
                  (size.stock_quantity ?? 0) > 0
                    ? "border-gray-300 text-gray-600"
                    : "border-gray-200 text-gray-300 line-through"
                }`}
              >
                {size.name}
              </span>
            ))}
          </div>
        )}

        {/* Category and Price - smaller text */}
        <div className="flex items-center justify-between flex-shrink-0">
          {product.categories?.name && (
            <p className="text-[10px] lg:text-xs text-gray-500 font-medium">
              {product.categories.name}
            </p>
          )}
          <p className="text-[11px] sm:text-xs lg:text-sm font-semibold text-gray-900 group-hover:text-primary transition-colors duration-200">
            ₹{product.price.toFixed(2)}
          </p>
        </div>
      </div>
    </div>
  );
}
