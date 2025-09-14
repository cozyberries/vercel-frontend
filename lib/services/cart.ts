import { createClient } from "@/lib/supabase";
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
   * Fetch user's cart from Supabase
   */
  async getUserCart(userId: string): Promise<CartItem[]> {
    try {
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

      return data?.items || [];
    } catch (error) {
      console.error("Error fetching user cart:", error);
      return [];
    }
  }

  /**
   * Save cart to Supabase (upsert operation)
   */
  async saveUserCart(userId: string, items: CartItem[]): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("user_carts")
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
        console.error("Error saving user cart:", error);
        throw error;
      }
    } catch (error) {
      console.error("Error saving user cart:", error);
      throw error;
    }
  }

  /**
   * Delete user's cart from Supabase
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
        // Merge quantities for existing items
        mergedItems.set(localItem.id, {
          ...existingItem,
          quantity: existingItem.quantity + localItem.quantity,
        });
      } else {
        // Add new local items
        mergedItems.set(localItem.id, localItem);
      }
    });

    return Array.from(mergedItems.values());
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
