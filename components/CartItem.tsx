"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { images } from "@/app/assets/images";
import type { CartItem } from "@/components/cart-context";
import DiscountedPrice from "@/components/discounted-price";

interface CartItemProps {
  item: CartItem;
  onQuantityChange: (id: string, quantity: number, size?: string, color?: string) => void;
  onRemove: (id: string, size?: string, color?: string) => void;
}

export default function CartItemRow({
  item,
  onQuantityChange,
  onRemove,
}: CartItemProps) {

  const maxedOut = item.stock_quantity != null && item.quantity >= item.stock_quantity;

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
        <div className="font-medium line-clamp-2">{item.name}</div>
        {(item.size || item.color) && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {[item.size && `Size: ${item.size}`, item.color && `Color: ${item.color}`]
              .filter(Boolean)
              .join(" · ")}
          </div>
        )}
        <div className="text-sm font-semibold mt-1">
          <DiscountedPrice price={item.price} />
        </div>
        {maxedOut && (
          <p className="text-xs text-amber-600 font-medium mt-1">
            Only {item.stock_quantity} item{item.stock_quantity === 1 ? " is" : "s are"} available
          </p>
        )}        <div className="mt-2 text-sm text-muted-foreground">
          <div className="inline-flex items-center border h-7 rounded-md overflow-hidden">
            <Button
              type="button"
              variant="ghost"
              className={`px-3 py-2 hover:bg-accent ${item.quantity <= 1 ? "opacity-50 cursor-not-allowed" : ""}`}
              disabled={item.quantity <= 1}
              onClick={() =>
                onQuantityChange(item.id, Math.max(1, item.quantity - 1), item.size, item.color)
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
              className={`px-3 py-2 hover:bg-accent ${maxedOut ? "opacity-50 cursor-not-allowed" : ""}`}
              disabled={maxedOut}
              onClick={() => {
                if (maxedOut) return;
                const next = item.quantity + 1;
                const maxQty = item.stock_quantity ?? next;
                onQuantityChange(item.id, Math.min(next, maxQty), item.size, item.color);
              }}
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
        onClick={() => onRemove(item.id, item.size, item.color)}
        className="hover:text-destructive"
      >
        ×
      </Button>
    </div>
  );
}
