"use client";
import React, { createContext, useContext, useState, ReactNode } from "react";
import { useCartPersistence } from "@/hooks/useCartPersistence";

export interface CartItem {
  id: string;
  name: string;
  price: number;
  image?: string;
  quantity: number;
  size?: string;
  color?: string;
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
    setIsTemporaryCart(false); // Reset temporary cart flag
    setTemporaryCartItem(null); // Clear temporary cart item
    const itemKey = getCartItemKey(item);
    setCart((prev) => {
      const existing = prev.find((i) => getCartItemKey(i) === itemKey);
      if (existing) {
        return prev.map((i) =>
          getCartItemKey(i) === itemKey
            ? { ...i, quantity: i.quantity + item.quantity }
            : i
        );
      }
      return [...prev, item];
    });
  };

  const removeFromCart = (id: string, size?: string, color?: string) => {
    const key = getCartItemKey({ id, size, color });
    setCart((prev) => prev.filter((i) => getCartItemKey(i) !== key));
  };

  const updateQuantity = (id: string, quantity: number, size?: string, color?: string) => {
    const key = getCartItemKey({ id, size, color });
    setCart((prev) =>
      prev.map((i) => (getCartItemKey(i) === key ? { ...i, quantity } : i))
    );
  };

  const clearCart = async () => {
    setIsTemporaryCart(false);
    setTemporaryCartItem(null);
    setCart([]);
    await clearAllCart();
  };

  const addToCartTemporary = (item: CartItem) => {
    // Add to cart temporarily without persisting to localStorage/Supabase
    setIsTemporaryCart(true);
    setTemporaryCartItem(item);
    setCart([item]);
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
