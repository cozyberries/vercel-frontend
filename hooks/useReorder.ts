"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCart } from "@/components/cart-context";
import { getProductById } from "@/lib/services/api";
import type { OrderItem } from "@/lib/types/order";

/**
 * Re-adds an order's items to the cart at their CURRENT price/stock (not the
 * price paid at the time) — checks each product/size is still available and
 * skips (with a toast) anything that's been discontinued or sold out.
 */
export function useReorder() {
  const { addToCart } = useCart();
  const router = useRouter();

  return useCallback(
    async (items: OrderItem[]) => {
      let addedCount = 0;
      const skipped: string[] = [];

      for (const item of items) {
        try {
          const product = await getProductById(item.id);
          if (!product) {
            skipped.push(item.name);
            continue;
          }

          const sizeOption = item.size
            ? product.sizes?.find((s) => s.name === item.size)
            : undefined;
          const stock = item.size ? (sizeOption?.stock_quantity ?? 0) : product.stock_quantity;
          const price = item.size ? (sizeOption?.price ?? product.price) : product.price;

          if (!stock || stock <= 0) {
            skipped.push(item.name);
            continue;
          }

          addToCart({
            id: product.id,
            name: product.name,
            price,
            image: product.images?.[0] ?? item.image,
            quantity: Math.min(item.quantity, stock),
            size: item.size,
            color: item.color,
            stock_quantity: stock,
          });
          addedCount++;
        } catch (err) {
          console.error(`Reorder lookup failed for item ${item.id}:`, err);
          skipped.push(item.name);
        }
      }

      if (addedCount > 0) {
        toast.success(`${addedCount} item${addedCount === 1 ? "" : "s"} added to cart!`);
        router.push("/cart");
      }
      if (skipped.length > 0) {
        toast.warning(`Couldn't re-add ${skipped.join(", ")} — out of stock or no longer available.`);
      }
    },
    [addToCart, router]
  );
}
