import { createClient } from "@/lib/supabase";
import { UpstashService } from "@/lib/upstash";
import type { CartItem } from "@/components/cart-context";

export interface UserCart {
  id: string;
  user_id: string;
  items: CartItem[];
  created_at: string;
  updated_at: string;
}

class CartService {
  private supabase = createClient();

  /**
   * Fetch user's cart from Supabase with Upstash caching
   */
  async getUserCart(userId: string): Promise<CartItem[]> {
    try {
      // Try to get from cache first
      const cachedCart = await UpstashService.getCachedUserCart(userId);
      if (cachedCart) {
        console.log("🔄 CACHE HIT: Cart loaded from Upstash Redis cache", {
          userId,
          itemCount: cachedCart.length,
          source: "UPSTASH_CACHE",
        });
        return cachedCart;
      }

      console.log(
        "🔍 CACHE MISS: Cart not found in Upstash, fetching from Supabase",
        {
          userId,
          source: "SUPABASE_FALLBACK",
        }
      );

      // If not in cache, fetch from Supabase
      const { data, error } = await this.supabase
        .from("user_carts")
        .select("items")
        .eq("user_id", userId)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 is "not found" error - expected for new users
        console.error("Error fetching user cart:", error);
        return [];
      }

      const cartItems = data?.items || [];

      console.log("📦 DATA FETCHED: Cart retrieved from Supabase database", {
        userId,
        itemCount: cartItems.length,
        source: "SUPABASE_DATABASE",
        willCache: cartItems.length > 0,
      });

      // Cache the result for future requests (best effort - don't fail if caching fails)
      if (cartItems.length > 0) {
        try {
          await UpstashService.cacheUserCart(userId, cartItems);
          console.log(
            "💾 CACHED: Cart data saved to Upstash for future requests",
            {
              userId,
              itemCount: cartItems.length,
            }
          );
        } catch (cacheError) {
          console.warn(
            "❌ CACHE FAILED: Unable to save cart to Upstash:",
            cacheError
          );
        }
      }

      return cartItems;
    } catch (error) {
      console.error("Error fetching user cart:", error);
      return [];
    }
  }

  /**
   * Save cart to Supabase (upsert operation) with Upstash caching
   */
  async saveUserCart(userId: string, items: CartItem[]): Promise<void> {
    try {
      const { error } = await this.supabase.from("user_carts").upsert(
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
        console.error("Error saving user cart:", error);
        throw error;
      }

      // Update cache after successful save (best effort - don't fail if caching fails)
      try {
        await UpstashService.cacheUserCart(userId, items);
      } catch (cacheError) {
        console.warn(
          "Failed to update cart cache after save, continuing:",
          cacheError
        );
      }
    } catch (error) {
      console.error("Error saving user cart:", error);
      throw error;
    }
  }

  /**
   * Delete user's cart from Supabase and clear cache
   */
  async clearUserCart(userId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("user_carts")
        .delete()
        .eq("user_id", userId);

      if (error) {
        console.error("Error clearing user cart:", error);
        throw error;
      }

      // Clear cache after successful deletion (best effort)
      try {
        await UpstashService.delete(`cart:${userId}`);
      } catch (cacheError) {
        console.warn(
          "Failed to clear cart cache after deletion, continuing:",
          cacheError
        );
      }
    } catch (error) {
      console.error("Error clearing user cart:", error);
      throw error;
    }
  }

  /**
   * Merge local cart with remote cart
   * Returns merged cart items
   */
  mergeCartItems(localItems: CartItem[], remoteItems: CartItem[]): CartItem[] {
    const mergedItems = new Map<string, CartItem>();

    // Add remote items first
    remoteItems.forEach((item) => {
      mergedItems.set(item.id, item);
    });

    // Add or merge local items
    localItems.forEach((localItem) => {
      const existingItem = mergedItems.get(localItem.id);
      if (existingItem) {
        // Check if this looks like a refresh scenario (same items with same quantities)
        // If so, prefer remote data to avoid doubling
        const isLikelyRefresh = this.areSimilarCarts(localItems, remoteItems);

        if (isLikelyRefresh) {
          // Prefer remote data on refresh scenarios
          // mergedItems already has the remote item, so do nothing
        } else {
          // True merge scenario - add quantities
          mergedItems.set(localItem.id, {
            ...existingItem,
            quantity: existingItem.quantity + localItem.quantity,
          });
        }
      } else {
        // Add new local items that don't exist remotely
        mergedItems.set(localItem.id, localItem);
      }
    });

    return Array.from(mergedItems.values());
  }

  /**
   * Check if local and remote carts are similar (indicating a refresh scenario)
   * rather than a true cross-device merge scenario
   */
  private areSimilarCarts(
    localItems: CartItem[],
    remoteItems: CartItem[]
  ): boolean {
    if (localItems.length !== remoteItems.length) {
      return false;
    }

    // If both carts have the same items with the same quantities,
    // it's likely a refresh scenario where data was just synced
    const localMap = new Map(
      localItems.map((item) => [item.id, item.quantity])
    );
    const remoteMap = new Map(
      remoteItems.map((item) => [item.id, item.quantity])
    );

    for (const [id, quantity] of localMap) {
      if (remoteMap.get(id) !== quantity) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get cart from localStorage
   */
  getLocalCart(): CartItem[] {
    try {
      if (typeof window === "undefined") return [];
      const stored = localStorage.getItem("cart");
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error("Error reading local cart:", error);
      return [];
    }
  }

  /**
   * Save cart to localStorage
   */
  saveLocalCart(items: CartItem[]): void {
    try {
      if (typeof window === "undefined") return;
      localStorage.setItem("cart", JSON.stringify(items));
    } catch (error) {
      console.error("Error saving local cart:", error);
    }
  }

  /**
   * Clear cart from localStorage
   */
  clearLocalCart(): void {
    try {
      if (typeof window === "undefined") return;
      localStorage.removeItem("cart");
    } catch (error) {
      console.error("Error clearing local cart:", error);
    }
  }
}

export const cartService = new CartService();
