"use client";

import { createContext, useCallback, useContext } from "react";
import { useAuth } from "@/components/supabase-auth-provider";
import { useCart } from "@/components/cart-context";
import { useWishlist } from "@/components/wishlist-context";
import { type PendingAuthIntent } from "@/lib/auth/pending-auth-intent";

interface AuthGateContextValue {
  /**
   * Returns true if signed in — caller should run the action (with toasts as usual).
   * Returns false if auth is loading, or if guest — in the guest case the item is applied
   * silently to cart/wishlist (or buy-now temp cart), matching design (no sign-in interrupt).
   */
  requireAuthForIntent: (intent: PendingAuthIntent) => boolean;
}

const AuthGateContext = createContext<AuthGateContextValue | undefined>(
  undefined,
);

export function AuthGateProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { addToCart, addToCartTemporary } = useCart();
  const { addToWishlist } = useWishlist();

  const requireAuthForIntent = useCallback(
    (intent: PendingAuthIntent): boolean => {
      if (loading) return false;
      if (user) return true;
      if (intent.type === "wishlist") {
        addToWishlist(intent.item);
      } else if (intent.type === "cart") {
        addToCart(intent.item);
      } else {
        addToCartTemporary(intent.item);
      }
      return false;
    },
    [loading, user, addToWishlist, addToCart, addToCartTemporary],
  );

  const value: AuthGateContextValue = {
    requireAuthForIntent,
  };

  return (
    <AuthGateContext.Provider value={value}>
      {children}
    </AuthGateContext.Provider>
  );
}

export function useAuthGate() {
  const ctx = useContext(AuthGateContext);
  if (!ctx) {
    throw new Error("useAuthGate must be used within AuthGateProvider");
  }
  return ctx;
}
