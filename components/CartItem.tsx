"use client";

import { Button } from "@/components/ui/button";
import { images } from "@/app/assets/images";

export interface CartLineItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

interface CartItemProps {
  item: CartLineItem;
  onQuantityChange: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
}

export default function CartItem({
  item,
  onQuantityChange,
  onRemove,
}: CartItemProps) {
  return (
    <div className="flex items-center gap-4 border-b pb-4">
      <img
        src={
          // item.image ||
          images.staticProductImage
        }
        alt={item.name}
        className="w-16 h-16 object-cover rounded"
      />
      <div className="flex-1">
        <div className="font-medium line-clamp-2">{item.name}</div>
        <div className="text-sm font-semibold mt-1">
          ₹{item.price.toFixed(2)}
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          <div className="inline-flex items-center border h-7 rounded-md overflow-hidden">
            <Button
              type="button"
              variant="ghost"
              className="px-3 py-2 hover:bg-accent"
              onClick={() =>
                onQuantityChange(item.id, Math.max(1, item.quantity - 1))
              }
              aria-label="Decrease quantity"
            >
              −
            </Button>
            <div className="px-4 py-2 min-w-10 text-center select-none text-foreground">
              {item.quantity}
            </div>
            <Button
              type="button"
              variant="ghost"
              className="px-3 py-2 hover:bg-accent"
              onClick={() => onQuantityChange(item.id, item.quantity + 1)}
              aria-label="Increase quantity"
            >
              +
            </Button>
          </div>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onRemove(item.id)}
        className="hover:text-destructive"
      >
        ×
      </Button>
    </div>
  );
}
