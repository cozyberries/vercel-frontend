"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { images } from "@/app/assets/images";
import { HiOutlineTrash } from "react-icons/hi";
import { ShoppingCart } from "lucide-react";

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
}

const WishlistItem: React.FC<WishlistItemProps> = ({
  item,
  onRemove,
  onAddToCart,
}) => {
  return (
    <div className="flex items-center gap-4 border-b pb-4">
      <div className="relative w-16 h-16 flex-shrink-0">
        <Image
          src={item.image || images.staticProductImage}
          alt={item.name}
          fill
          sizes="64px"
          className="object-cover rounded"
        />
      </div>
      <div className="flex-1">
        <div className="font-medium line-clamp-2">
          <Link href={`/products/${item.id}`}>{item.name}</Link>
        </div>
        <div className="text-sm font-semibold mt-1">
          ₹{item.price.toFixed(2)}
        </div>
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
        <Button variant="ghost" size="icon" onClick={() => onRemove(item.id)}>
        <HiOutlineTrash />
      </Button>
      </div>
    </div>
  );
};

export default WishlistItem;
