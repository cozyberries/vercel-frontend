"use client";

import Image from "next/image";
import { ChevronDown, Minus, Plus, Trash2 } from "lucide-react";
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
    <div className="flex gap-4 rounded-2xl border border-cb-border p-4">
      <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-cb-linen">
        <Image
          src={item.image || images.staticProductImage}
          alt={item.name}
          fill
          sizes="112px"
          className="object-cover"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-cb-fg leading-snug line-clamp-2">
            {item.name}
          </h3>
          <button
            type="button"
            onClick={() => onRemove(item.id, item.size, item.color)}
            className="shrink-0 text-cb-muted-fg hover:text-cb-destructive transition-colors"
            aria-label="Remove from cart"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        {(item.color || item.size) && (
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-cb-border px-2.5 py-1 text-[13px] text-cb-muted-fg">
            {[item.color, item.size && `Size ${item.size}`].filter(Boolean).join(" · ")}
            <ChevronDown className="h-3 w-3" />
          </span>
        )}
        {maxedOut && (
          <p className="text-xs text-amber-600 font-medium mt-1">
            Only {item.stock_quantity} item{item.stock_quantity === 1 ? " is" : "s are"} available
          </p>
        )}
        <div className="mt-3 flex items-center justify-between">
          <div className="inline-flex items-center gap-3 rounded-full border border-cb-border px-1 h-9">
            <button
              type="button"
              className={`flex h-7 w-7 items-center justify-center rounded-full text-cb-fg ${item.quantity <= 1 ? "opacity-40 cursor-not-allowed" : "hover:bg-cb-muted"}`}
              disabled={item.quantity <= 1}
              onClick={() =>
                onQuantityChange(item.id, Math.max(1, item.quantity - 1), item.size, item.color)
              }
              aria-label="Decrease quantity"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-4 text-center text-sm font-semibold text-cb-fg select-none">
              {item.quantity}
            </span>
            <button
              type="button"
              className={`flex h-7 w-7 items-center justify-center rounded-full text-cb-fg ${maxedOut ? "opacity-40 cursor-not-allowed" : "hover:bg-cb-muted"}`}
              disabled={maxedOut}
              onClick={() => {
                if (maxedOut) return;
                const next = item.quantity + 1;
                const maxQty = item.stock_quantity ?? next;
                onQuantityChange(item.id, Math.min(next, maxQty), item.size, item.color);
              }}
              aria-label="Increase quantity"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <DiscountedPrice price={item.price} className="text-base font-bold" />
        </div>
      </div>
    </div>
  );
}
