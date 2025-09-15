import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/components/supabase-auth-provider";
import { cartService } from "@/lib/services/cart";
import type { CartItem } from "@/components/cart-context";

interface UseCartPersistenceProps {
  cart: CartItem[];
  setCart: (items: CartItem[]) => void;
}

export function useCartPersistence({ cart, setCart }: UseCartPersistenceProps) {
  const { user, loading: authLoading } = useAuth();
  const syncTimeoutRef = useRef<NodeJS.Timeout>();
  const hasInitializedRef = useRef(false);
  const previousUserIdRef = useRef<string | null>(null);
  const isInitializingRef = useRef(false);

  /**
   * Debounced sync to Supabase to avoid excessive API calls
   */
  const debouncedSyncToSupabase = useCallback(
    (items: CartItem[]) => {
      if (!user?.id) return;

      // Clear previous timeout
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }

      // Set new timeout for background sync
      syncTimeoutRef.current = setTimeout(async () => {
        try {
          await cartService.saveUserCart(user.id, items);
          console.log("Cart synced to Supabase in background");
        } catch (error) {
          console.error("Failed to sync cart to Supabase:", error);
          // Optionally, you could implement retry logic here
        }
      }, 1000); // 1 second debounce
    },
    [user?.id]
  );

  /**
   * Load initial cart data with faster local-first approach
   */
  const loadInitialCart = useCallback(async () => {
    if (authLoading || hasInitializedRef.current) return;

    isInitializingRef.current = true;
    try {
      // Always load local cart immediately for instant UI
      const localCart = cartService.getLocalCart();
      setCart(localCart);
      hasInitializedRef.current = true;

      if (user?.id) {
        // User is authenticated - merge with remote cart in background
        try {
          const remoteCart = await cartService.getUserCart(user.id);
          const mergedCart = cartService.mergeCartItems(localCart, remoteCart);
          
          // Only update if there's a difference
          if (JSON.stringify(localCart) !== JSON.stringify(mergedCart)) {
            setCart(mergedCart);
            cartService.saveLocalCart(mergedCart);
            if (mergedCart.length > 0) {
              await cartService.saveUserCart(user.id, mergedCart);
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
      setCart([]);
      hasInitializedRef.current = true;
    } finally {
      isInitializingRef.current = false;
    }
  }, [user?.id, authLoading, setCart]);

  /**
   * Handle user authentication changes
   */
  const handleAuthChange = useCallback(async () => {
    if (authLoading) return;

    const currentUserId = user?.id || null;
    const previousUserId = previousUserIdRef.current;

    // Skip if user hasn't changed
    if (currentUserId === previousUserId) return;

    if (currentUserId && !previousUserId) {
      // User just signed in - merge carts
      try {
        const localCart = cartService.getLocalCart();
        const remoteCart = await cartService.getUserCart(currentUserId);
        const mergedCart = cartService.mergeCartItems(localCart, remoteCart);
        
        setCart(mergedCart);
        // Note: persistence effect will handle saving merged cart
      } catch (error) {
        console.error("Error merging carts on sign in:", error);
      }
    } else if (!currentUserId && previousUserId) {
      // User just signed out - keep local cart only
      const localCart = cartService.getLocalCart();
      setCart(localCart);
    }

    previousUserIdRef.current = currentUserId;
  }, [user?.id, authLoading, setCart]);

  /**
   * Persist cart changes
   */
  const persistCart = useCallback(
    (items: CartItem[]) => {
      // Always save to localStorage immediately
      cartService.saveLocalCart(items);

      // If user is authenticated, sync to Supabase in background
      if (user?.id) {
        debouncedSyncToSupabase(items);
      }
    },
    [user?.id, debouncedSyncToSupabase]
  );

  /**
   * Clear cart from all storage locations
   */
  const clearAllCart = useCallback(async () => {
    cartService.clearLocalCart();
    
    if (user?.id) {
      try {
        await cartService.clearUserCart(user.id);
      } catch (error) {
        console.error("Failed to clear remote cart:", error);
      }
    }
  }, [user?.id]);

  // Load initial cart on mount only
  useEffect(() => {
    if (!authLoading && !hasInitializedRef.current) {
      loadInitialCart();
    }
  }, [authLoading, loadInitialCart]);

  // Handle auth changes separately (only when user ID actually changes)
  useEffect(() => {
    if (!authLoading && hasInitializedRef.current) {
      handleAuthChange();
    }
  }, [user?.id, handleAuthChange]);

  // Persist cart changes (but skip during initialization to avoid duplicate saves)
  useEffect(() => {
    // Only persist if initialized, not currently loading, and not initializing
    if (hasInitializedRef.current && cart.length >= 0 && !authLoading && !isInitializingRef.current) {
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
