/**
 * Browser-side wishlist client.
 *
 * All remote reads and writes go through the `/api/wishlist` server route so
 * that impersonation (admin-order-on-behalf, a.k.a. shadow mode) works
 * correctly: the server derives the effective user from the session +
 * `acting_as` cookie, and the browser never needs to know whose wishlist it
 * is. `localStorage` is used purely as an instant-UI / guest-mode cache.
 *
 * The persistence hook (`useWishlistPersistence`) controls localStorage
 * gating based on `useAuth().impersonation.active`: while impersonating, the
 * hook bypasses localStorage entirely and reads/writes only via this
 * service. The service itself remains pure: `getLocalWishlist` /
 * `saveLocalWishlist` stay intact so guest-mode continues to work.
 */

import type { WishlistItem } from "@/components/wishlist-context";
import { extractErrorMessage } from "@/lib/utils/http-errors";

export interface UserWishlist {
  id: string;
  user_id: string;
  items: WishlistItem[];
  created_at: string;
  updated_at: string;
}

class WishlistService {
  // Key: userId passed by the caller. Used only as a dedup bucket; the server
  // ignores it and scopes by the effective user.
  private fetchRequests = new Map<string, Promise<WishlistItem[]>>();

  async getUserWishlist(userId: string): Promise<WishlistItem[]> {
    const existing = this.fetchRequests.get(userId);
    if (existing) return existing;

    const requestPromise = this._getUserWishlistInternal();
    this.fetchRequests.set(userId, requestPromise);
    try {
      return await requestPromise;
    } finally {
      this.fetchRequests.delete(userId);
    }
  }

  private async _getUserWishlistInternal(): Promise<WishlistItem[]> {
    try {
      const response = await fetch("/api/wishlist", {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status !== 401) {
          console.error(
            "Error fetching user wishlist: non-OK response",
            response.status
          );
        }
        return [];
      }

      const body = (await response.json()) as { wishlist?: WishlistItem[] };
      return body.wishlist ?? [];
    } catch (error) {
      console.error("Error fetching user wishlist:", error);
      return [];
    }
  }

  async saveUserWishlist(
    _userId: string,
    items: WishlistItem[]
  ): Promise<void> {
    const response = await fetch("/api/wishlist", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });

    if (!response.ok) {
      const message = await extractErrorMessage(
        response,
        "Failed to save wishlist"
      );
      console.error("Error saving user wishlist:", message);
      throw new Error(message);
    }
  }

  async clearUserWishlist(_userId: string): Promise<void> {
    const response = await fetch("/api/wishlist", {
      method: "DELETE",
      credentials: "include",
    });

    if (!response.ok) {
      const message = await extractErrorMessage(
        response,
        "Failed to clear wishlist"
      );
      console.error("Error clearing user wishlist:", message);
      throw new Error(message);
    }
  }

  /**
   * Merge local wishlist with remote wishlist
   * Returns merged wishlist items (no duplicates)
   */
  mergeWishlistItems(
    localItems: WishlistItem[],
    remoteItems: WishlistItem[]
  ): WishlistItem[] {
    const mergedItems = new Map<string, WishlistItem>();

    remoteItems.forEach((item) => {
      mergedItems.set(item.id, item);
    });

    localItems.forEach((localItem) => {
      if (!mergedItems.has(localItem.id)) {
        mergedItems.set(localItem.id, localItem);
      }
    });

    return Array.from(mergedItems.values());
  }

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

  saveLocalWishlist(items: WishlistItem[]): void {
    try {
      if (typeof window === "undefined") return;
      localStorage.setItem("wishlist", JSON.stringify(items));
    } catch (error) {
      console.error("Error saving local wishlist:", error);
    }
  }

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
