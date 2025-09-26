import { createClient } from "@/lib/supabase";
import type { WishlistItem } from "@/components/wishlist-context";
import CacheService from "@/lib/services/cache";

export interface UserWishlist {
  id: string;
  user_id: string;
  items: WishlistItem[];
  created_at: string;
  updated_at: string;
}

class WishlistService {
  private supabase = createClient();

  /**
   * Fetch user's wishlist from Supabase with Redis caching
   * Implements stale-while-revalidate pattern for optimal performance
   */
  async getUserWishlist(userId: string): Promise<WishlistItem[]> {
    try {
      // Try to get from cache first
      const { data: cachedWishlist, isStale } = await CacheService.getWishlist(userId);
      
      // If we have cached data, return it immediately
      if (cachedWishlist) {
        // If data is stale, trigger background revalidation
        if (isStale) {
          this.refreshWishlistInBackground(userId);
        }
        return cachedWishlist;
      }

      // No cache hit, fetch from database
      return await this.fetchWishlistFromDatabase(userId);
    } catch (error) {
      console.error("Error fetching user wishlist:", error);
      return [];
    }
  }

  /**
   * Fetch wishlist directly from database and update cache
   */
  private async fetchWishlistFromDatabase(userId: string): Promise<WishlistItem[]> {
    try {
      const { data, error } = await this.supabase
        .from("user_wishlists")
        .select("items")
        .eq("user_id", userId)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 is "not found" error - expected for new users
        console.error("Error fetching user wishlist:", error);
        return [];
      }

      const wishlistItems = data?.items || [];
      
      // Cache the result
      await CacheService.setWishlist(userId, wishlistItems);
      
      return wishlistItems;
    } catch (error) {
      console.error("Error fetching wishlist from database:", error);
      return [];
    }
  }

  /**
   * Background refresh for stale-while-revalidate pattern
   */
  private async refreshWishlistInBackground(userId: string): Promise<void> {
    try {
      console.log(`Background refresh for wishlist: ${userId}`);
      await this.fetchWishlistFromDatabase(userId);
    } catch (error) {
      console.error(`Background wishlist refresh failed for user ${userId}:`, error);
    }
  }

  /**
   * Save wishlist to Supabase (upsert operation) and update cache
   */
  async saveUserWishlist(userId: string, items: WishlistItem[]): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("user_wishlists")
        .upsert(
          {
            user_id: userId,
            items: items,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "user_id",
          }
        );

      if (error) {
        console.error("Error saving user wishlist:", error);
        throw error;
      }

      // Update cache with the new data
      await CacheService.setWishlist(userId, items);

    } catch (error) {
      console.error("Error saving user wishlist:", error);
      throw error;
    }
  }

  /**
   * Delete user's wishlist from Supabase and clear cache
   */
  async clearUserWishlist(userId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("user_wishlists")
        .delete()
        .eq("user_id", userId);

      if (error) {
        console.error("Error clearing user wishlist:", error);
        throw error;
      }

      // Clear cache
      await CacheService.clearWishlist(userId);

    } catch (error) {
      console.error("Error clearing user wishlist:", error);
      throw error;
    }
  }

  /**
   * Merge local wishlist with remote wishlist
   * Returns merged wishlist items (no duplicates)
   */
  mergeWishlistItems(localItems: WishlistItem[], remoteItems: WishlistItem[]): WishlistItem[] {
    const mergedItems = new Map<string, WishlistItem>();

    // Add remote items first
    remoteItems.forEach((item) => {
      mergedItems.set(item.id, item);
    });

    // Add local items (no duplicates since wishlists don't have quantities)
    localItems.forEach((localItem) => {
      if (!mergedItems.has(localItem.id)) {
        mergedItems.set(localItem.id, localItem);
      }
    });

    return Array.from(mergedItems.values());
  }

  /**
   * Get wishlist from localStorage
   */
  getLocalWishlist(): WishlistItem[] {
    try {
      if (typeof window === "undefined") return [];
      const stored = localStorage.getItem("wishlist");
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error("Error reading local wishlist:", error);
      return [];
    }
  }

  /**
   * Save wishlist to localStorage
   */
  saveLocalWishlist(items: WishlistItem[]): void {
    try {
      if (typeof window === "undefined") return;
      localStorage.setItem("wishlist", JSON.stringify(items));
    } catch (error) {
      console.error("Error saving local wishlist:", error);
    }
  }

  /**
   * Clear wishlist from localStorage
   */
  clearLocalWishlist(): void {
    try {
      if (typeof window === "undefined") return;
      localStorage.removeItem("wishlist");
    } catch (error) {
      console.error("Error clearing local wishlist:", error);
    }
  }
}

export const wishlistService = new WishlistService();
