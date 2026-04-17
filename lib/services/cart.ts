/**
 * Browser-side cart client.
 *
 * All remote reads and writes go through the `/api/cart` server route so that
 * impersonation (admin-order-on-behalf, a.k.a. shadow mode) works correctly:
 * the server derives the effective user from the session + `acting_as`
 * cookie, and the browser never needs to know whose cart it is. `localStorage`
 * is used purely as an instant-UI / guest-mode cache.
 *
 * TODO(phase-4): when `useAuth().impersonation` is set, bypass the
 * `localStorage` fallback entirely so an admin shopping on behalf of a
 * customer never sees or writes their own device-local data.
 */

import type { CartItem } from "@/components/cart-context";
import { getCartItemKey } from "@/components/cart-context";

export interface UserCart {
  id: string;
  user_id: string;
  items: CartItem[];
  created_at: string;
  updated_at: string;
}

class CartService {
  // Key: userId passed by the caller. Used only as a dedup bucket; the server
  // ignores it and scopes by the effective user.
  private cacheRequests = new Map<string, Promise<CartItem[]>>();

  async getUserCart(userId: string): Promise<CartItem[]> {
    const existing = this.cacheRequests.get(userId);
    if (existing) return existing;

    const requestPromise = this._getUserCartInternal();
    this.cacheRequests.set(userId, requestPromise);
    try {
      return await requestPromise;
    } finally {
      this.cacheRequests.delete(userId);
    }
  }

  private async _getUserCartInternal(): Promise<CartItem[]> {
    try {
      const response = await fetch("/api/cart", {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        // 401 (not signed in) and other errors collapse to an empty cart.
        if (response.status !== 401) {
          console.error(
            "Error fetching user cart: non-OK response",
            response.status
          );
        }
        return [];
      }

      const body = (await response.json()) as { cart?: CartItem[] };
      return body.cart ?? [];
    } catch (error) {
      console.error("Error fetching user cart:", error);
      return [];
    }
  }

  async saveUserCart(_userId: string, items: CartItem[]): Promise<void> {
    const response = await fetch("/api/cart", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });

    if (!response.ok) {
      const message = await extractErrorMessage(response, "Failed to save cart");
      console.error("Error saving user cart:", message);
      throw new Error(message);
    }
  }

  async clearUserCart(_userId: string): Promise<void> {
    const response = await fetch("/api/cart", {
      method: "DELETE",
      credentials: "include",
    });

    if (!response.ok) {
      const message = await extractErrorMessage(
        response,
        "Failed to clear cart"
      );
      console.error("Error clearing user cart:", message);
      throw new Error(message);
    }
  }

  /**
   * Merge local cart with remote cart
   * Returns merged cart items
   */
  mergeCartItems(localItems: CartItem[], remoteItems: CartItem[]): CartItem[] {
    const mergedItems = new Map<string, CartItem>();

    remoteItems.forEach((item) => {
      mergedItems.set(getCartItemKey(item), item);
    });

    localItems.forEach((localItem) => {
      const key = getCartItemKey(localItem);
      const existingItem = mergedItems.get(key);
      if (existingItem) {
        // If local and remote look identical (same items + quantities), this
        // is a refresh scenario rather than a cross-device merge: prefer
        // remote so we don't double counts.
        const isLikelyRefresh = this.areSimilarCarts(localItems, remoteItems);

        if (isLikelyRefresh) {
          // mergedItems already has the remote item, so do nothing
        } else {
          mergedItems.set(key, {
            ...existingItem,
            quantity: existingItem.quantity + localItem.quantity,
          });
        }
      } else {
        mergedItems.set(key, localItem);
      }
    });

    return Array.from(mergedItems.values());
  }

  private areSimilarCarts(
    localItems: CartItem[],
    remoteItems: CartItem[]
  ): boolean {
    if (localItems.length !== remoteItems.length) {
      return false;
    }

    const localMap = new Map(
      localItems.map((item) => [getCartItemKey(item), item.quantity])
    );
    const remoteMap = new Map(
      remoteItems.map((item) => [getCartItemKey(item), item.quantity])
    );

    for (const [key, quantity] of localMap) {
      if (remoteMap.get(key) !== quantity) {
        return false;
      }
    }

    return true;
  }

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

  saveLocalCart(items: CartItem[]): void {
    try {
      if (typeof window === "undefined") return;
      localStorage.setItem("cart", JSON.stringify(items));
    } catch (error) {
      console.error("Error saving local cart:", error);
    }
  }

  clearLocalCart(): void {
    try {
      if (typeof window === "undefined") return;
      localStorage.removeItem("cart");
    } catch (error) {
      console.error("Error clearing local cart:", error);
    }
  }
}

async function extractErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body?.error === "string" && body.error.trim()) {
      return body.error;
    }
  } catch {
    // Body was empty or not JSON; fall through to default.
  }
  return `${fallback} (HTTP ${response.status})`;
}

export const cartService = new CartService();
