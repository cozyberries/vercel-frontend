import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/components/supabase-auth-provider";
import { wishlistService } from "@/lib/services/wishlist";
import type { WishlistItem } from "@/components/wishlist-context";

interface UseWishlistPersistenceProps {
  wishlist: WishlistItem[];
  setWishlist: (items: WishlistItem[]) => void;
}

export function useWishlistPersistence({ wishlist, setWishlist }: UseWishlistPersistenceProps) {
  const { user, loading: authLoading, impersonation } = useAuth();
  const syncTimeoutRef = useRef<NodeJS.Timeout>();
  const hasInitializedRef = useRef(false);
  const previousUserIdRef = useRef<string | null>(null);
  const previousImpersonationTargetRef = useRef<string | null>(null);
  const isInitializingRef = useRef(false);
  const isSyncingRef = useRef(false);
  const lastSyncedWishlistRef = useRef<string>("");
  const userIdRef = useRef<string | undefined>(user?.id);
  const setWishlistRef = useRef(setWishlist);
  const impersonationActiveRef = useRef(impersonation.active);

  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);

  useEffect(() => {
    setWishlistRef.current = setWishlist;
  }, [setWishlist]);

  useEffect(() => {
    impersonationActiveRef.current = impersonation.active;
  }, [impersonation.active]);

  const debouncedSyncToSupabase = useCallback(
    (items: WishlistItem[], userId: string) => {
      const wishlistHash = JSON.stringify(items);
      if (isSyncingRef.current && lastSyncedWishlistRef.current === wishlistHash) {
        return;
      }

      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }

      syncTimeoutRef.current = setTimeout(async () => {
        if (isSyncingRef.current) return;

        try {
          isSyncingRef.current = true;
          lastSyncedWishlistRef.current = wishlistHash;
          await wishlistService.saveUserWishlist(userId, items);
        } catch (error) {
          console.error("Error syncing wishlist:", error);
        } finally {
          isSyncingRef.current = false;
        }
      }, 1000);
    },
    []
  );

  const loadInitialWishlist = useCallback(async () => {
    if (authLoading || hasInitializedRef.current) return;

    const isImpersonating = impersonationActiveRef.current;

    isInitializingRef.current = true;
    try {
      const currentSetWishlist = setWishlistRef.current;
      const userId = userIdRef.current;

      if (isImpersonating) {
        try {
          const remoteWishlist = await wishlistService.getUserWishlist(userId ?? "");
          currentSetWishlist(remoteWishlist);
        } catch (error) {
          console.error("Error fetching remote wishlist under impersonation:", error);
          currentSetWishlist([]);
        }
        hasInitializedRef.current = true;
        return;
      }

      const localWishlist = wishlistService.getLocalWishlist();
      currentSetWishlist(localWishlist);
      hasInitializedRef.current = true;

      if (userId) {
        try {
          const remoteWishlist = await wishlistService.getUserWishlist(userId);
          const mergedWishlist = wishlistService.mergeWishlistItems(localWishlist, remoteWishlist);

          const localHash = JSON.stringify(localWishlist);
          const mergedHash = JSON.stringify(mergedWishlist);

          if (localHash !== mergedHash) {
            currentSetWishlist(mergedWishlist);
            wishlistService.saveLocalWishlist(mergedWishlist);
            if (mergedWishlist.length > 0) {
              await wishlistService.saveUserWishlist(userId, mergedWishlist);
            }
          }
        } catch (error) {
          console.error("Error syncing remote wishlist:", error);
        }
      }
    } catch (error) {
      console.error("Error loading initial wishlist:", error);
      setWishlistRef.current([]);
      hasInitializedRef.current = true;
    } finally {
      isInitializingRef.current = false;
    }
  }, [authLoading]);

  const reinitialize = useCallback(async () => {
    hasInitializedRef.current = false;
    lastSyncedWishlistRef.current = "";
    await loadInitialWishlist();
  }, [loadInitialWishlist]);

  const handleAuthChange = useCallback(async () => {
    if (authLoading) return;

    const currentUserId = userIdRef.current || null;
    const previousUserId = previousUserIdRef.current;

    if (currentUserId === previousUserId) return;

    if (currentUserId && !previousUserId) {
      if (impersonationActiveRef.current) {
        try {
          const remoteWishlist = await wishlistService.getUserWishlist(currentUserId);
          setWishlistRef.current(remoteWishlist);
        } catch (error) {
          console.error("Error fetching remote wishlist on sign-in (impersonation):", error);
        }
      } else {
        try {
          const localWishlist = wishlistService.getLocalWishlist();
          const remoteWishlist = await wishlistService.getUserWishlist(currentUserId);
          const mergedWishlist = wishlistService.mergeWishlistItems(localWishlist, remoteWishlist);

          setWishlistRef.current(mergedWishlist);
          wishlistService.saveLocalWishlist(mergedWishlist);

          if (mergedWishlist.length > 0) {
            await wishlistService.saveUserWishlist(currentUserId, mergedWishlist);
          }
        } catch (error) {
          console.error("Error merging wishlists on sign in:", error);
        }
      }
    } else if (!currentUserId && previousUserId) {
      const localWishlist = impersonationActiveRef.current
        ? []
        : wishlistService.getLocalWishlist();
      setWishlistRef.current(localWishlist);
    }

    previousUserIdRef.current = currentUserId;
  }, [authLoading]);

  const persistWishlist = useCallback(
    (items: WishlistItem[]) => {
      const isImpersonating = impersonationActiveRef.current;

      if (!isImpersonating) {
        wishlistService.saveLocalWishlist(items);
      }

      const userId = userIdRef.current;
      if (userId) {
        debouncedSyncToSupabase(items, userId);
      }
    },
    [debouncedSyncToSupabase]
  );

  /**
   * Clear wishlist. While impersonating, only clear server-side so the
   * admin's own device-local wishlist is preserved.
   */
  const clearAllWishlist = useCallback(async () => {
    const isImpersonating = impersonationActiveRef.current;
    if (!isImpersonating) {
      wishlistService.clearLocalWishlist();
    }

    const userId = userIdRef.current;
    if (userId) {
      try {
        await wishlistService.clearUserWishlist(userId);
      } catch (error) {
        console.error("Failed to clear remote wishlist:", error);
      }
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !hasInitializedRef.current) {
      loadInitialWishlist();
    }
  }, [authLoading, loadInitialWishlist]);

  useEffect(() => {
    if (!authLoading && hasInitializedRef.current) {
      handleAuthChange();
    }
  }, [user?.id, authLoading, handleAuthChange]);

  useEffect(() => {
    const currentTarget = impersonation.active
      ? impersonation.target?.id ?? null
      : null;
    const previousTarget = previousImpersonationTargetRef.current;
    if (currentTarget === previousTarget) return;
    previousImpersonationTargetRef.current = currentTarget;

    if (hasInitializedRef.current) {
      reinitialize();
    }
  }, [impersonation.active, impersonation.target?.id, reinitialize]);

  useEffect(() => {
    if (hasInitializedRef.current && wishlist.length >= 0 && !authLoading && !isInitializingRef.current) {
      persistWishlist(wishlist);
    }
  }, [wishlist, persistWishlist, authLoading]);

  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

  return {
    isLoading: authLoading || !hasInitializedRef.current,
    clearAllWishlist,
  };
}
