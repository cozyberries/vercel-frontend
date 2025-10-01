import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/components/supabase-auth-provider";
import { wishlistService } from "@/lib/services/wishlist";
import type { WishlistItem } from "@/components/wishlist-context";

interface UseWishlistPersistenceProps {
  wishlist: WishlistItem[];
  setWishlist: (items: WishlistItem[]) => void;
}

export function useWishlistPersistence({ wishlist, setWishlist }: UseWishlistPersistenceProps) {
  const { user, loading: authLoading } = useAuth();
  const syncTimeoutRef = useRef<NodeJS.Timeout>();
  const hasInitializedRef = useRef(false);
  const previousUserIdRef = useRef<string | null>(null);
  const isInitializingRef = useRef(false);
  const isSyncingRef = useRef(false);
  const lastSyncedWishlistRef = useRef<string>("");
  const userIdRef = useRef<string | undefined>(user?.id);
  const setWishlistRef = useRef(setWishlist);

  // Update refs when props change
  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);

  useEffect(() => {
    setWishlistRef.current = setWishlist;
  }, [setWishlist]);

  /**
   * Debounced sync to Supabase to avoid excessive API calls
   */
  const debouncedSyncToSupabase = useCallback(
    (items: WishlistItem[], userId: string) => {
      // Skip if already syncing the same wishlist
      const wishlistHash = JSON.stringify(items);
      if (isSyncingRef.current && lastSyncedWishlistRef.current === wishlistHash) {
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
          lastSyncedWishlistRef.current = wishlistHash;
          await wishlistService.saveUserWishlist(userId, items);
        } catch (error) {
          console.error("Error syncing wishlist:", error);
        } finally {
          isSyncingRef.current = false;
        }
      }, 1000); // 1 second debounce
    },
    []
  );

  /**
   * Load initial wishlist data with faster local-first approach
   */
  const loadInitialWishlist = useCallback(async () => {
    if (authLoading || hasInitializedRef.current) return;

    isInitializingRef.current = true;
    try {
      // Always load local wishlist immediately for instant UI
      const localWishlist = wishlistService.getLocalWishlist();
      const currentSetWishlist = setWishlistRef.current;
      currentSetWishlist(localWishlist);
      hasInitializedRef.current = true;

      const userId = userIdRef.current;
      if (userId) {
        // User is authenticated - merge with remote wishlist in background
        try {
          const remoteWishlist = await wishlistService.getUserWishlist(userId);
          const mergedWishlist = wishlistService.mergeWishlistItems(localWishlist, remoteWishlist);
          
          // Only update if there's a difference
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
          // Continue with local wishlist - no need to show error to user
        }
      }
    } catch (error) {
      console.error("Error loading initial wishlist:", error);
      // Fallback to empty wishlist
      setWishlistRef.current([]);
      hasInitializedRef.current = true;
    } finally {
      isInitializingRef.current = false;
    }
  }, [authLoading]);

  /**
   * Handle user authentication changes
   */
  const handleAuthChange = useCallback(async () => {
    if (authLoading) return;

    const currentUserId = userIdRef.current || null;
    const previousUserId = previousUserIdRef.current;

    // Skip if user hasn't changed
    if (currentUserId === previousUserId) return;

    if (currentUserId && !previousUserId) {
      // User just signed in - merge wishlists
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
    } else if (!currentUserId && previousUserId) {
      // User just signed out - keep local wishlist only
      const localWishlist = wishlistService.getLocalWishlist();
      setWishlistRef.current(localWishlist);
    }

    previousUserIdRef.current = currentUserId;
  }, [authLoading]);

  /**
   * Persist wishlist changes
   */
  const persistWishlist = useCallback(
    (items: WishlistItem[]) => {
      // Always save to localStorage immediately
      wishlistService.saveLocalWishlist(items);

      // If user is authenticated, sync to Supabase in background
      const userId = userIdRef.current;
      if (userId) {
        debouncedSyncToSupabase(items, userId);
      }
    },
    [debouncedSyncToSupabase]
  );

  /**
   * Clear wishlist from all storage locations
   */
  const clearAllWishlist = useCallback(async () => {
    wishlistService.clearLocalWishlist();
    
    const userId = userIdRef.current;
    if (userId) {
      try {
        await wishlistService.clearUserWishlist(userId);
      } catch (error) {
        console.error("Failed to clear remote wishlist:", error);
      }
    }
  }, []);

  // Load initial wishlist on mount only
  useEffect(() => {
    if (!authLoading && !hasInitializedRef.current) {
      loadInitialWishlist();
    }
  }, [authLoading, loadInitialWishlist]);

  // Handle auth changes separately (only when user ID actually changes)
  useEffect(() => {
    if (!authLoading && hasInitializedRef.current) {
      handleAuthChange();
    }
  }, [user?.id, authLoading, handleAuthChange]);

  // Persist wishlist changes (but skip during initialization to avoid duplicate saves)
  useEffect(() => {
    // Only persist if initialized, not currently loading, and not initializing
    if (hasInitializedRef.current && wishlist.length >= 0 && !authLoading && !isInitializingRef.current) {
      persistWishlist(wishlist);
    }
  }, [wishlist, persistWishlist, authLoading]);

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
    clearAllWishlist,
  };
}
