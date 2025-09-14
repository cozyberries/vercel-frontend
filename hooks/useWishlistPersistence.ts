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

  /**
   * Debounced sync to Supabase to avoid excessive API calls
   */
  const debouncedSyncToSupabase = useCallback(
    (items: WishlistItem[]) => {
      if (!user?.id) return;

      // Clear previous timeout
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }

      // Set new timeout for background sync
      syncTimeoutRef.current = setTimeout(async () => {
        try {
          await wishlistService.saveUserWishlist(user.id, items);
          console.log("Wishlist synced to Supabase in background");
        } catch (error) {
          console.error("Failed to sync wishlist to Supabase:", error);
          // Optionally, you could implement retry logic here
        }
      }, 1000); // 1 second debounce
    },
    [user?.id]
  );

  /**
   * Load initial wishlist data
   */
  const loadInitialWishlist = useCallback(async () => {
    if (authLoading || hasInitializedRef.current) return;

    try {
      const localWishlist = wishlistService.getLocalWishlist();

      if (user?.id) {
        // User is authenticated - merge local and remote wishlists
        const remoteWishlist = await wishlistService.getUserWishlist(user.id);
        const mergedWishlist = wishlistService.mergeWishlistItems(localWishlist, remoteWishlist);
        
        setWishlist(mergedWishlist);
        
        // Save merged wishlist locally and remotely
        wishlistService.saveLocalWishlist(mergedWishlist);
        if (mergedWishlist.length > 0) {
          await wishlistService.saveUserWishlist(user.id, mergedWishlist);
        }
      } else {
        // Anonymous user - use local wishlist only
        setWishlist(localWishlist);
      }

      hasInitializedRef.current = true;
    } catch (error) {
      console.error("Error loading initial wishlist:", error);
      // Fallback to local wishlist only
      const localWishlist = wishlistService.getLocalWishlist();
      setWishlist(localWishlist);
      hasInitializedRef.current = true;
    }
  }, [user?.id, authLoading, setWishlist]);

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
      // User just signed in - merge wishlists
      try {
        const localWishlist = wishlistService.getLocalWishlist();
        const remoteWishlist = await wishlistService.getUserWishlist(currentUserId);
        const mergedWishlist = wishlistService.mergeWishlistItems(localWishlist, remoteWishlist);
        
        setWishlist(mergedWishlist);
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
      setWishlist(localWishlist);
    }

    previousUserIdRef.current = currentUserId;
  }, [user?.id, authLoading, setWishlist]);

  /**
   * Persist wishlist changes
   */
  const persistWishlist = useCallback(
    (items: WishlistItem[]) => {
      // Always save to localStorage immediately
      wishlistService.saveLocalWishlist(items);

      // If user is authenticated, sync to Supabase in background
      if (user?.id) {
        debouncedSyncToSupabase(items);
      }
    },
    [user?.id, debouncedSyncToSupabase]
  );

  /**
   * Clear wishlist from all storage locations
   */
  const clearAllWishlist = useCallback(async () => {
    wishlistService.clearLocalWishlist();
    
    if (user?.id) {
      try {
        await wishlistService.clearUserWishlist(user.id);
      } catch (error) {
        console.error("Failed to clear remote wishlist:", error);
      }
    }
  }, [user?.id]);

  // Load initial wishlist on mount and auth changes
  useEffect(() => {
    if (!authLoading) {
      loadInitialWishlist();
      handleAuthChange();
    }
  }, [loadInitialWishlist, handleAuthChange, authLoading]);

  // Persist wishlist changes
  useEffect(() => {
    if (hasInitializedRef.current && wishlist.length >= 0) {
      persistWishlist(wishlist);
    }
  }, [wishlist, persistWishlist]);

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
