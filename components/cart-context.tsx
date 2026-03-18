"use client";
import React, { createContext, useContext, useState, ReactNode } from "react";
import { flushSync } from "react-dom";
import { useCartPersistence } from "@/hooks/useCartPersistence";
import { logEvent } from "@/lib/services/event-logger";

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

/** Unique key for a cart line item (same product in different sizes = different keys) */
export function getCartItemKey(item: Pick<CartItem, "id" | "size" | "color">): string {
  return `${item.id}|${item.size ?? ""}|${item.color ?? ""}`;
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (id: string, size?: string, color?: string) => void;
  updateQuantity: (id: string, quantity: number, size?: string, color?: string) => void;
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
        setCart(items);
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
    const key = getCartItemKey({ id, size, color });
    setCart((prev) => prev.filter((i) => getCartItemKey(i) !== key));
    logEvent("cart_remove", { product_id: id, size, color });
  };

  const updateQuantity = (id: string, quantity: number, size?: string, color?: string) => {
    const key = getCartItemKey({ id, size, color });
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
