"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Product } from "@/lib/services/api";
import { useWishlist } from "./wishlist-context";
import { toast } from "sonner";
import { images } from "@/app/assets/images";

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const router = useRouter();
  const inWishlist = isInWishlist(product.id);

  return (
    <div
      key={product.id}
      className="group border-gray-200 flex flex-col h-full min-h-[320px] md:min-h-[400px] overflow-hidden"
    >
      {/* Image Section */}
      <div className="relative overflow-hidden bg-[#f5f5f5] border md:h-[82%] h-[81%]">
        <Link href={`/products/${product.id}`}>
          <Image
            src={
              product.images?.[0] &&
              typeof product.images[0] === "string" &&
              product.images[0].trim() !== ""
                ? product.images[0]
                : images.staticProductImage
            }
            alt={product.name}
            width={500}
            height={500}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </Link>

        {/* Heart Icon Button for Wishlist */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 bg-white/80 hover:bg-white rounded-full h-8 w-8"
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
            className={`h-4 w-4 ${
              inWishlist ? "fill-red-500 text-red-500" : ""
            }`}
          />
          <span className="sr-only">
            {inWishlist ? "Remove from wishlist" : "Add to wishlist"}
          </span>
        </Button>
      </div>

      {/* Content Section */}
      <div className="flex flex-col md:h-[18%] h-[19%] py-2 md:py-1 justify-between">
        {/* Product Info and Price Row */}
        <div className="flex justify-between items-start">
          {/* Product Info Block */}
          <div className="flex-1 pr-2">
            <h3 className="text-base md:text-lg font-medium mb-1 line-clamp-1">
              <Link
                href={`/products/${product.id}`}
                className="hover:text-primary"
              >
                {product.name}
              </Link>
            </h3>
            {product.category && product.category !== "Uncategorized" && (
              <p className="text-sm text-muted-foreground">
                {product.category}
              </p>
            )}
          </div>

          {/* Price Block */}
          <div className="flex-shrink-0">
            <p className="font-medium text-right text-base md:text-lg">
              ₹{product.price.toFixed(2)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
