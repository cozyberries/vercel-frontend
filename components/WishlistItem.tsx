"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { images } from "@/app/assets/images";
import { HiOutlineTrash } from "react-icons/hi";
import { ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";

export interface WishlistLineItem {
  id: string;
  name: string;
  price: number;
  image?: string;
  size?: string;
  color?: string;
}

export interface WishlistItemProps {
  item: WishlistLineItem;
  onRemove: (id: string) => void;
  onAddToCart?: (item: WishlistLineItem) => void;
  setOpen: (open: boolean) => void;
}

const WishlistItem: React.FC<WishlistItemProps> = ({
  item,
  onRemove,
  onAddToCart,
  setOpen,
}) => {
  const router = useRouter();

  const handleProductClick = () => {
    router.push(`/products/${item.id}`);
    setOpen(false);
  };
  return (
    <div className="flex items-center gap-4 border-b pb-4 cursor-pointer">
      <div
        onClick={handleProductClick}
        className="relative w-16 h-16 flex-shrink-0 block rounded overflow-hidden cursor-pointer"
        aria-label={`View product details for ${item.name}`}
      >
        <Image
          src={item.image || images.staticProductImage}
          alt={item.name}
          fill
          sizes="64px"
          className="object-cover rounded"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="font-medium line-clamp-2 hover:underline block cursor-pointer"
          onClick={handleProductClick}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleProductClick(); }}
          role="button"
          tabIndex={0}
        >
          {item.name}
        </div>        <div className="text-sm font-semibold mt-1">
          ₹{item.price.toFixed(0)}
        </div>
        {(item.size || item.color) && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {[item.size, item.color].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        {onAddToCart && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onAddToCart(item)}
            aria-label="Add to cart"
          >
            <ShoppingCart className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={() => onRemove(item.id)} aria-label="Remove from wishlist">
          <HiOutlineTrash />
        </Button>
      </div>
    </div>
  );
};

export default WishlistItem;
