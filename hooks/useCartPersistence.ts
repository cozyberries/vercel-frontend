import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/components/supabase-auth-provider";
import { cartService } from "@/lib/services/cart";
import type { CartItem } from "@/components/cart-context";

interface UseCartPersistenceProps {
  cart: CartItem[];
  setCart: (items: CartItem[]) => void;
  isTemporaryCart?: boolean;
}

export function useCartPersistence({
  cart,
  setCart,
  isTemporaryCart = false,
}: UseCartPersistenceProps) {
  const { user, loading: authLoading } = useAuth();
  const syncTimeoutRef = useRef<NodeJS.Timeout>();
  const hasInitializedRef = useRef(false);
  const previousUserIdRef = useRef<string | null>(null);
  const isInitializingRef = useRef(false);
  const isSyncingRef = useRef(false);
  const lastSyncedCartRef = useRef<string>("");
  const userIdRef = useRef<string | undefined>(user?.id);
  const setCartRef = useRef(setCart);

  // Update refs when props change
  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);

  useEffect(() => {
    setCartRef.current = setCart;
  }, [setCart]);

  /**
   * Debounced sync to Supabase to avoid excessive API calls
   */
  const debouncedSyncToSupabase = useCallback(
    (items: CartItem[], userId: string) => {
      // Skip if already syncing the same cart
      const cartHash = JSON.stringify(items);
      if (isSyncingRef.current && lastSyncedCartRef.current === cartHash) {
        return;
      }

      // Clear previous timeout
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }

      // Set new timeout for background sync
      syncTimeoutRef.current = setTimeout(async () => {
        if (isSyncingRef.current) return;
        
        try {
          isSyncingRef.current = true;
          lastSyncedCartRef.current = cartHash;
          await cartService.saveUserCart(userId, items);
        } catch (error) {
          console.error("Error syncing cart:", error);
        } finally {
          isSyncingRef.current = false;
        }
      }, 1000); // 1 second debounce
    },
    []
  );

  /**
   * Load initial cart data with faster local-first approach
   */
  const loadInitialCart = useCallback(async () => {
    if (authLoading || hasInitializedRef.current || isTemporaryCart) {
      return;
    }

    isInitializingRef.current = true;
    try {
      // Always load local cart immediately for instant UI
      const localCart = cartService.getLocalCart();
      const currentSetCart = setCartRef.current;
      currentSetCart(localCart);
      hasInitializedRef.current = true;

      const userId = userIdRef.current;
      if (userId) {
        // User is authenticated - merge with remote cart in background
        try {
          const remoteCart = await cartService.getUserCart(userId);
          const mergedCart = cartService.mergeCartItems(localCart, remoteCart);

          // Only update if there's a difference
          const localHash = JSON.stringify(localCart);
          const mergedHash = JSON.stringify(mergedCart);
          
          if (localHash !== mergedHash) {
            currentSetCart(mergedCart);
            cartService.saveLocalCart(mergedCart);
            if (mergedCart.length > 0) {
              await cartService.saveUserCart(userId, mergedCart);
            }
          }
        } catch (error) {
          console.error("Error syncing remote cart:", error);
          // Continue with local cart - no need to show error to user
        }
      }
    } catch (error) {
      console.error("Error loading initial cart:", error);
      // Fallback to empty cart
      setCartRef.current([]);
      hasInitializedRef.current = true;
    } finally {
      isInitializingRef.current = false;
    }
  }, [authLoading, isTemporaryCart]);

  /**
   * Handle user authentication changes
   */
  const handleAuthChange = useCallback(async () => {
    if (authLoading || isTemporaryCart) return;

    const currentUserId = userIdRef.current || null;
    const previousUserId = previousUserIdRef.current;

    // Skip if user hasn't changed
    if (currentUserId === previousUserId) return;

    if (currentUserId && !previousUserId) {
      // User just signed in - merge carts
      try {
        const localCart = cartService.getLocalCart();
        const remoteCart = await cartService.getUserCart(currentUserId);
        const mergedCart = cartService.mergeCartItems(localCart, remoteCart);

        setCartRef.current(mergedCart);
        cartService.saveLocalCart(mergedCart);
        // Note: persistence effect will handle saving merged cart
      } catch (error) {
        console.error("Error merging carts on sign in:", error);
      }
    } else if (!currentUserId && previousUserId) {
      // User just signed out - keep local cart only
      const localCart = cartService.getLocalCart();
      setCartRef.current(localCart);
    }

    previousUserIdRef.current = currentUserId;
  }, [authLoading, isTemporaryCart]);

  /**
   * Persist cart changes
   */
  const persistCart = useCallback(
    (items: CartItem[]) => {
      // Don't persist if this is a temporary cart
      if (isTemporaryCart) {
        return;
      }

      // Always save to localStorage immediately
      cartService.saveLocalCart(items);

      // If user is authenticated, sync to Supabase in background
      const userId = userIdRef.current;
      if (userId) {
        debouncedSyncToSupabase(items, userId);
      }
    },
    [debouncedSyncToSupabase, isTemporaryCart]
  );

  /**
   * Clear cart from all storage locations
   */
  const clearAllCart = useCallback(async () => {
    cartService.clearLocalCart();

    const userId = userIdRef.current;
    if (userId) {
      try {
        await cartService.clearUserCart(userId);
      } catch (error) {
        console.error("Failed to clear remote cart:", error);
      }
    }
  }, []);

  // Load initial cart on mount only (skip if temporary cart)
  useEffect(() => {
    if (!authLoading && !hasInitializedRef.current && !isTemporaryCart) {
      loadInitialCart();
    }
  }, [authLoading, loadInitialCart, isTemporaryCart]);

  // Handle auth changes separately (only when user ID actually changes, skip if temporary cart)
  useEffect(() => {
    if (!authLoading && hasInitializedRef.current && !isTemporaryCart) {
      handleAuthChange();
    }
  }, [user?.id, authLoading, isTemporaryCart, handleAuthChange]);

  // Persist cart changes (but skip during initialization to avoid duplicate saves)
  useEffect(() => {
    // Only persist if initialized, not currently loading, and not initializing
    if (
      hasInitializedRef.current &&
      cart.length >= 0 &&
      !authLoading &&
      !isInitializingRef.current
    ) {
      persistCart(cart);
    }
  }, [cart, persistCart, authLoading]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

  return {
    isLoading: authLoading || !hasInitializedRef.current,
    clearAllCart,
  };
}
