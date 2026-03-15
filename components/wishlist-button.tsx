"use client";

import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWishlist } from "./wishlist-context";
import { toast } from "sonner";
import { Product } from "@/lib/services/api";

interface WishlistButtonProps {
  product: Product;
}

export default function WishlistButton({ product }: WishlistButtonProps) {
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const inWishlist = isInWishlist(product.id);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-10 w-10 shrink-0"
      onClick={() => {
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
      <Heart className={`h-5 w-5 ${inWishlist ? "fill-red-500 text-red-500" : ""}`} />
      <span className="sr-only">
        {inWishlist ? "Remove from wishlist" : "Add to wishlist"}
      </span>
    </Button>
  );
}
