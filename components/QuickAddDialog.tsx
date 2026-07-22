"use client";

import { useEffect, useState } from "react";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import SupabaseImage from "@/components/ui/supabase-image";
import DiscountedPrice from "@/components/discounted-price";
import { images } from "@/app/assets/images";

interface AddOption {
  size?: string;
  color?: string;
  price: number;
  label: string;
  stock: number;
}

interface QuickAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  productImage?: string;
  productColor?: string;
  addOptions: AddOption[];
  onConfirm: (size: string | undefined, qty: number) => void;
}

export default function QuickAddDialog({
  open,
  onOpenChange,
  productName,
  productImage,
  productColor,
  addOptions,
  onConfirm,
}: QuickAddDialogProps) {
  const [size, setSize] = useState<string | undefined>(undefined);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (open) {
      setSize(undefined);
      setQty(1);
    }
  }, [open]);

  const sizes = Array.from(
    new Set(addOptions.map((o) => o.size).filter(Boolean))
  ) as string[];
  const selectedOption = addOptions.find((o) => o.size === size);
  const unitPrice = selectedOption?.price ?? addOptions[0]?.price ?? 0;
  const stock = selectedOption?.stock ?? 99;

  const handleConfirm = () => {
    if (!size) return;
    onConfirm(size, qty);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Add to cart</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-4">
          <div className="h-[72px] w-[60px] shrink-0 overflow-hidden rounded-lg bg-cb-linen">
            <SupabaseImage
              src={productImage ?? images.staticProductImage}
              alt={productName}
              preset="thumbnail"
              width={60}
              height={72}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-cb-fg">{productName}</p>
            {productColor && (
              <p className="text-sm text-cb-muted-fg">{productColor}</p>
            )}
            <DiscountedPrice price={unitPrice} className="mt-1" />
          </div>
        </div>

        <div>
          <p className="mb-2 font-semibold text-cb-fg">Select age / size</p>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSize(s)}
                className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                  size === s
                    ? "border-cb-terracotta bg-cb-peach text-cb-terracotta-deep"
                    : "border-cb-border text-cb-fg hover:border-cb-terracotta"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
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

        <button
          type="button"
          disabled={!size}
          onClick={handleConfirm}
          className={`flex h-12 w-full items-center justify-center gap-2 rounded-full font-semibold text-white transition-colors ${
            size
              ? "bg-cb-terracotta hover:bg-cb-terracotta-deep"
              : "bg-cb-peach text-white/90 cursor-not-allowed"
          }`}
        >
          {size ? (
            <>
              <ShoppingBag className="h-4 w-4" />
              Add · ₹{unitPrice * qty}
            </>
          ) : (
            <>
              <ShoppingBag className="h-4 w-4" />
              Select a size
            </>
          )}
        </button>
      </DialogContent>
    </Dialog>
  );
}
