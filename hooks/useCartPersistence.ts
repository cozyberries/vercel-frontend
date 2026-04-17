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
  const { user, loading: authLoading, impersonation } = useAuth();
  const syncTimeoutRef = useRef<NodeJS.Timeout>();
  const hasInitializedRef = useRef(false);
  const previousUserIdRef = useRef<string | null>(null);
  // Tracks the id currently being shadowed (target.id). Used to detect a
  // change of impersonation target and force a re-init.
  const previousImpersonationTargetRef = useRef<string | null>(null);
  const isInitializingRef = useRef(false);
  const isSyncingRef = useRef(false);
  const lastSyncedCartRef = useRef<string>("");
  const userIdRef = useRef<string | undefined>(user?.id);
  const setCartRef = useRef(setCart);
  const impersonationActiveRef = useRef(impersonation.active);

  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);

  useEffect(() => {
    setCartRef.current = setCart;
  }, [setCart]);

  useEffect(() => {
    impersonationActiveRef.current = impersonation.active;
  }, [impersonation.active]);

  /**
   * Debounced sync to the server. When impersonating we skip localStorage
   * entirely — the hook never touches the admin's device cache while acting
   * on behalf of a customer.
   */
  const debouncedSyncToSupabase = useCallback(
    (items: CartItem[], userId: string) => {
      const cartHash = JSON.stringify(items);
      if (isSyncingRef.current && lastSyncedCartRef.current === cartHash) {
        return;
      }

      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }

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
      }, 1000);
    },
    []
  );

  const loadInitialCart = useCallback(async () => {
    if (authLoading || hasInitializedRef.current || isTemporaryCart) {
      return;
    }

    const isImpersonating = impersonationActiveRef.current;

    isInitializingRef.current = true;
    try {
      const currentSetCart = setCartRef.current;
      const userId = userIdRef.current;

      if (isImpersonating) {
        // Shadow mode: never touch localStorage. Go straight to the server.
        // An admin acting on behalf of a customer must not see or write their
        // own device-local cart.
        try {
          const remoteCart = await cartService.getUserCart(userId ?? "");
          currentSetCart(remoteCart);
        } catch (error) {
          console.error("Error fetching remote cart under impersonation:", error);
          currentSetCart([]);
        }
        hasInitializedRef.current = true;
        return;
      }

      const localCart = cartService.getLocalCart();
      currentSetCart(localCart);
      hasInitializedRef.current = true;

      if (userId) {
        try {
          const remoteCart = await cartService.getUserCart(userId);
          const mergedCart = cartService.mergeCartItems(localCart, remoteCart);

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
        }
      }
    } catch (error) {
      console.error("Error loading initial cart:", error);
      setCartRef.current([]);
      hasInitializedRef.current = true;
    } finally {
      isInitializingRef.current = false;
    }
  }, [authLoading, isTemporaryCart]);

  /**
   * Re-initialize from scratch. Used when the effective user changes
   * (login, logout, or impersonation target swap).
   */
  const reinitialize = useCallback(async () => {
    hasInitializedRef.current = false;
    lastSyncedCartRef.current = "";
    await loadInitialCart();
  }, [loadInitialCart]);

  const handleAuthChange = useCallback(async () => {
    if (authLoading || isTemporaryCart) return;

    const currentUserId = userIdRef.current || null;
    const previousUserId = previousUserIdRef.current;

    if (currentUserId === previousUserId) return;

    if (currentUserId && !previousUserId) {
      if (impersonationActiveRef.current) {
        // Under impersonation: fetch fresh server cart, no local merge.
        try {
          const remoteCart = await cartService.getUserCart(currentUserId);
          setCartRef.current(remoteCart);
        } catch (error) {
          console.error("Error fetching remote cart on sign-in (impersonation):", error);
        }
      } else {
        try {
          const localCart = cartService.getLocalCart();
          const remoteCart = await cartService.getUserCart(currentUserId);
          const mergedCart = cartService.mergeCartItems(localCart, remoteCart);

          setCartRef.current(mergedCart);
          cartService.saveLocalCart(mergedCart);
        } catch (error) {
          console.error("Error merging carts on sign in:", error);
        }
      }
    } else if (!currentUserId && previousUserId) {
      const localCart = impersonationActiveRef.current
        ? []
        : cartService.getLocalCart();
      setCartRef.current(localCart);
    }

    previousUserIdRef.current = currentUserId;
  }, [authLoading, isTemporaryCart]);

  const persistCart = useCallback(
    (items: CartItem[]) => {
      const isImpersonating = impersonationActiveRef.current;

      if (!isImpersonating) {
        cartService.saveLocalCart(items);
      }

      if (isTemporaryCart) return;

      const userId = userIdRef.current;
      if (userId) {
        debouncedSyncToSupabase(items, userId);
      }
    },
    [debouncedSyncToSupabase, isTemporaryCart]
  );

  /**
   * Clear cart from storage. While impersonating, only clear the server
   * side — do NOT blow away the admin's own local cache.
   */
  const clearAllCart = useCallback(async () => {
    const isImpersonating = impersonationActiveRef.current;
    if (!isImpersonating) {
      cartService.clearLocalCart();
    }

    const userId = userIdRef.current;
    if (userId) {
      try {
        await cartService.clearUserCart(userId);
      } catch (error) {
        console.error("Failed to clear remote cart:", error);
      }
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !hasInitializedRef.current && !isTemporaryCart) {
      loadInitialCart();
    }
  }, [authLoading, loadInitialCart, isTemporaryCart]);

  useEffect(() => {
    if (!authLoading && hasInitializedRef.current && !isTemporaryCart) {
      handleAuthChange();
    }
  }, [user?.id, authLoading, isTemporaryCart, handleAuthChange]);

  // React to impersonation target changes: re-fetch from server and reset
  // local dedup refs. Treat target swap as an auth change.
  useEffect(() => {
    if (isTemporaryCart) return;
    const currentTarget = impersonation.active
      ? impersonation.target?.id ?? null
      : null;
    const previousTarget = previousImpersonationTargetRef.current;
    if (currentTarget === previousTarget) return;
    previousImpersonationTargetRef.current = currentTarget;

    if (hasInitializedRef.current) {
      reinitialize();
    }
  }, [impersonation.active, impersonation.target?.id, isTemporaryCart, reinitialize]);

  useEffect(() => {
    if (
      hasInitializedRef.current &&
      cart.length >= 0 &&
      !authLoading &&
      !isInitializingRef.current
    ) {
      persistCart(cart);
    }
  }, [cart, persistCart, authLoading]);

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
