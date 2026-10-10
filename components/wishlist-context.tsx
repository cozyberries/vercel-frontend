"use client";
import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
} from "react";
import { useWishlistPersistence } from "@/hooks/useWishlistPersistence";
import { withCurrentSlugs } from "@/lib/catalog/renamed";

export interface WishlistItem {
  id: string;
  name: string;
  price: number;
  image?: string;
  size?: string;
  color?: string;
}

interface WishlistContextType {
  wishlist: WishlistItem[];
  addToWishlist: (item: WishlistItem) => void;
  removeFromWishlist: (id: string) => void;
  isInWishlist: (id: string) => boolean;
  clearWishlist: () => void;
  isLoading: boolean;
}

const WishlistContext = createContext<WishlistContextType | undefined>(
  undefined
);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);

  // Use wishlist persistence hook for Supabase integration. Wishlists saved before a slug fix
  // move to the new slug as they load.
  const { isLoading, clearAllWishlist } = useWishlistPersistence({
    wishlist,
    setWishlist: (items: WishlistItem[]) => setWishlist(withCurrentSlugs(items)),
  });

  const addToWishlist = (item: WishlistItem) => {
    setWishlist((prev) => {
      if (prev.some((i) => i.id === item.id)) return prev;
      return [...prev, item];
    });
  };

  const removeFromWishlist = (id: string) => {
    setWishlist((prev) => prev.filter((i) => i.id !== id));
  };

  const isInWishlist = (id: string) => wishlist.some((i) => i.id === id);

  const clearWishlist = async () => {
    setWishlist([]);
    await clearAllWishlist();
  };

  return (
    <WishlistContext.Provider
      value={{
        wishlist,
        addToWishlist,
        removeFromWishlist,
        isInWishlist,
        clearWishlist,
        isLoading,
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context)
    throw new Error("useWishlist must be used within a WishlistProvider");
  return context;
}
