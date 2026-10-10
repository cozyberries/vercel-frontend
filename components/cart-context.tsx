"use client";
import React, { createContext, useContext, useState, ReactNode } from "react";
import { flushSync } from "react-dom";
import { useCartPersistence } from "@/hooks/useCartPersistence";
import { logEvent } from "@/lib/services/event-logger";
import { currentPrintSlug, currentProductSlug } from "@/lib/catalog/renamed";

export interface CartItem {
  id: string;
  name: string;
  price: number;
  image?: string;
  quantity: number;
  size?: string;
  color?: string;
  stock_quantity?: number;
}

/**
 * Unique key for a cart line: product + size. Colour is left out: each print is its own product,
 * and the pages disagree on it (the product page saves `product.colors[0]`, cards and the bundle
 * save none, a reorder saves the order's colour name), which used to split one size into two lines.
 */
export function getCartItemKey(item: Pick<CartItem, "id" | "size">): string {
  return `${item.id}|${item.size ?? ""}`;
}

/**
 * Folds lines that share a key into the first of them, capped at its stock. Carts saved while
 * colour was still part of the key can hold the same size twice. Lines saved before a slug fix
 * (lib/catalog/renamed-products.json) move to the new product and print slug first.
 */
export function collapseCartLines(items: CartItem[]): CartItem[] {
  const lines = new Map<string, CartItem>();
  for (const saved of items) {
    const item = { ...saved, id: currentProductSlug(saved.id), ...(saved.color ? { color: currentPrintSlug(saved.color) } : {}) };
    const key = getCartItemKey(item);
    const kept = lines.get(key);
    if (!kept) {
      lines.set(key, { ...item });
      continue;
    }
    const quantity = kept.quantity + item.quantity;
    kept.quantity = kept.stock_quantity != null ? Math.min(quantity, kept.stock_quantity) : quantity;
  }
  return Array.from(lines.values());
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (id: string, size?: string, color?: string) => void;
  updateQuantity: (id: string, quantity: number, size?: string) => void;
  clearCart: () => void;
  addToCartTemporary: (item: CartItem) => void;
  isLoading: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isTemporaryCart, setIsTemporaryCart] = useState(false);
  const [temporaryCartItem, setTemporaryCartItem] = useState<CartItem | null>(
    null
  );

  // Use cart persistence hook for Supabase integration
  const { isLoading, clearAllCart } = useCartPersistence({
    cart,
    setCart: (items: CartItem[]) => {
      // If we have a temporary cart item, don't let persistence override it
      if (isTemporaryCart && temporaryCartItem) {
        setCart([temporaryCartItem]);
      } else {
        setCart(collapseCartLines(items));
      }
    },
    isTemporaryCart,
  });

  const addToCart = (item: CartItem) => {
    setIsTemporaryCart(false);
    setTemporaryCartItem(null);
    const itemKey = getCartItemKey(item);
    setCart((prev) => {
      const existing = prev.find((i) => getCartItemKey(i) === itemKey);
      if (existing) {
        const stockQty = existing.stock_quantity ?? item.stock_quantity;
        const maxQty = stockQty ?? Infinity;
        const newQty = Math.min(Math.max(1, existing.quantity + item.quantity), maxQty);
        return prev.map((i) =>
          getCartItemKey(i) === itemKey
            ? { ...i, quantity: newQty, stock_quantity: stockQty }
            : i
        );
      }
      const maxQty = item.stock_quantity ?? Infinity;
      const qty = Math.min(Math.max(1, item.quantity), maxQty);
      return [...prev, { ...item, quantity: qty }];
    });
    logEvent("cart_add", { product_id: item.id, quantity: item.quantity, size: item.size, color: item.color });
  };

  const removeFromCart = (id: string, size?: string, color?: string) => {
    const key = getCartItemKey({ id, size });
    setCart((prev) => prev.filter((i) => getCartItemKey(i) !== key));
    logEvent("cart_remove", { product_id: id, size, color });
  };

  const updateQuantity = (id: string, quantity: number, size?: string) => {
    const key = getCartItemKey({ id, size });
    setCart((prev) =>
      prev.map((i) => {
        if (getCartItemKey(i) !== key) return i;
        const maxQty = i.stock_quantity ?? Infinity;
        const capped = Math.min(Math.max(1, quantity), maxQty);
        return { ...i, quantity: capped };
      })
    );
  };

  const clearCart = async () => {
    setIsTemporaryCart(false);
    setTemporaryCartItem(null);
    setCart([]);
    await clearAllCart();
    logEvent("cart_clear");
  };

  const addToCartTemporary = (item: CartItem) => {
    // flushSync commits state synchronously so callers can navigate immediately
    // after this call without a setTimeout race.
    flushSync(() => {
      setIsTemporaryCart(true);
      setTemporaryCartItem(item);
      setCart([item]);
    });
  };

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        addToCartTemporary,
        isLoading,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within a CartProvider");
  return context;
}
