"use client";

import { useEffect, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import Image from "next/image";
import DiscountedPrice from "@/components/discounted-price";
import { images } from "@/app/assets/images";
import { getProductById } from "@/lib/services/api";
import type { CartItem } from "@/components/cart-context";

interface SizeChoice {
  size: string;
  price: number;
  stock: number;
}

interface EditCartItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CartItem;
  onUpdate: (newSize: string | undefined, newQty: number, newPrice: number, newStock: number) => void;
}

export default function EditCartItemDialog({
  open,
  onOpenChange,
  item,
  onUpdate,
}: EditCartItemDialogProps) {
  const [choices, setChoices] = useState<SizeChoice[]>([]);
  const [size, setSize] = useState<string | undefined>(item.size);
  const [qty, setQty] = useState(item.quantity);

  useEffect(() => {
    if (!open) return;
    setSize(item.size);
    setQty(item.quantity);

    let cancelled = false;
    getProductById(item.id).then((product) => {
      if (cancelled || !product) return;
      const sizeChoices: SizeChoice[] =
        (product.variants?.length ?? 0) > 0
          ? (product.variants ?? [])
              .filter((v) => (v.stock_quantity ?? 0) > 0)
              .map((v) => ({ size: v.size, price: v.price, stock: v.stock_quantity ?? 0 }))
          : (product.sizes ?? [])
              .filter((s) => (s.stock_quantity ?? 0) > 0)
              .map((s) => ({ size: s.name, price: s.price, stock: s.stock_quantity ?? 0 }));
      setChoices(sizeChoices);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item.id]);

  const selectedChoice = choices.find((c) => c.size === size);
  const unitPrice = selectedChoice?.price ?? item.price;
  const stock = selectedChoice?.stock ?? item.stock_quantity ?? 99;

  const handleUpdate = () => {
    onUpdate(size, Math.min(qty, stock), unitPrice, stock);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl p-0 max-h-[88vh] flex flex-col lg:top-1/2 lg:left-1/2 lg:right-auto lg:-translate-x-1/2 lg:-translate-y-1/2 lg:bottom-auto lg:rounded-2xl lg:max-w-md lg:w-full lg:h-auto"
      >
        <div className="flex h-full min-h-0 flex-col p-6">
          <SheetHeader className="p-0 pb-4 text-left">
            <SheetTitle className="text-xl font-semibold text-cb-fg">Edit item</SheetTitle>
          </SheetHeader>

          <div className="flex items-center gap-4">
            <div className="relative h-[72px] w-[60px] shrink-0 overflow-hidden rounded-lg bg-cb-linen">
              <Image
                src={item.image || images.staticProductImage}
                alt={item.name}
                fill
                sizes="60px"
                className="object-cover"
              />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-cb-fg">{item.name}</p>
              {item.color && (
                <p className="text-sm text-cb-muted-fg">{item.color}</p>
              )}
              <DiscountedPrice price={unitPrice} className="mt-1" />
            </div>
          </div>

          {choices.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 font-semibold text-cb-fg">Select age / size</p>
              <div className="flex flex-wrap gap-2">
                {choices.map((c) => (
                  <button
                    key={c.size}
                    type="button"
                    onClick={() => setSize(c.size)}
                    className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                      size === c.size
                        ? "border-cb-terracotta bg-cb-peach text-cb-terracotta-deep"
                        : "border-cb-border text-cb-fg hover:border-cb-terracotta"
                    }`}
                  >
                    {c.size}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center justify-between">
            <p className="font-semibold text-cb-fg">Quantity</p>
            <div className="flex items-center gap-3 rounded-full border border-cb-border px-1">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                className="flex h-8 w-8 items-center justify-center disabled:opacity-30"
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-4 text-center font-semibold tabular-nums">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(stock, q + 1))}
                disabled={qty >= stock}
                className="flex h-8 w-8 items-center justify-center disabled:opacity-30"
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-6 border-t border-cb-border pt-5">
            <button
              type="button"
              onClick={handleUpdate}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep font-semibold text-white transition-colors"
            >
              <Check className="h-4 w-4" />
              Update · ₹{(unitPrice * qty).toFixed(0)}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
