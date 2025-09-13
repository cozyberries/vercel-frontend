"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { images } from "@/app/assets/images";
import { HiOutlineTrash } from "react-icons/hi";

export interface WishlistLineItem {
  id: string;
  name: string;
  price: number;
  image?: string;
}

interface WishlistItemProps {
  item: WishlistLineItem;
  onRemove: (id: string) => void;
  onAddToCart: (item: WishlistLineItem) => void;
}

export default function WishlistItem({
  item,
  onRemove,
  onAddToCart,
}: WishlistItemProps) {
  return (
    <div className="flex items-center gap-4 border-b pb-4">
      <img
        src={item.image || images.staticProductImage}
        alt={item.name}
        className="w-16 h-16 object-cover rounded"
      />
      <div className="flex-1">
        <div className="font-medium line-clamp-2">
          <Link href={`/products/${item.id}`}>{item.name}</Link>
        </div>
        <div className="text-sm font-semibold mt-1">
          ₹{item.price.toFixed(2)}
        </div>
        <div className="mt-2">
          <Button
            size="sm"
            variant={"outline"}
            onClick={() => onAddToCart(item)}
          >
            Add to Cart
          </Button>
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={() => onRemove(item.id)}>
        <HiOutlineTrash />
      </Button>
    </div>
  );
}
