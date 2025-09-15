import { createClient } from "@/lib/supabase";
import { UpstashService } from "@/lib/upstash";
import type { WishlistItem } from "@/components/wishlist-context";

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
   * Fetch user's wishlist from Supabase with Upstash caching
   */
  async getUserWishlist(userId: string): Promise<WishlistItem[]> {
    try {
      // Try to get from cache first
      const cachedWishlist = await UpstashService.getCachedUserWishlist(userId);
      if (cachedWishlist) {
        console.log("Wishlist loaded from Upstash cache");
        return cachedWishlist;
      }

      // If not in cache, fetch from Supabase
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
      
      // Cache the result for future requests
      if (wishlistItems.length > 0) {
        await UpstashService.cacheUserWishlist(userId, wishlistItems);
      }

      return wishlistItems;
    } catch (error) {
      console.error("Error fetching user wishlist:", error);
      return [];
    }
  }

  /**
   * Save wishlist to Supabase (upsert operation) with Upstash caching
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

      // Update cache after successful save
      await UpstashService.cacheUserWishlist(userId, items);
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

      // Clear cache after successful deletion
      await UpstashService.delete(`wishlist:${userId}`);
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
