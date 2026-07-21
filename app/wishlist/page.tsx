"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWishlist } from "@/components/wishlist-context";
import { useCart, getCartItemKey } from "@/components/cart-context";
import { useAuthGate } from "@/components/auth-gate-context";
import { images } from "@/app/assets/images";
import { toast } from "sonner";
import WishlistWarningDialog from "@/components/wishlist-warning-dialog";
import DiscountedPrice from "@/components/discounted-price";
import { useState } from "react";

export default function WishlistPage() {
  const { wishlist, removeFromWishlist, clearWishlist, isLoading } =
    useWishlist();
  const { cart, updateQuantity, addToCart } = useCart();
  const { requireAuthForIntent } = useAuthGate();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleAddToCart = (item: {
    id: string;
    name: string;
    price: number;
    image?: string;
    size?: string;
    color?: string;
  }) => {
    const itemKey = getCartItemKey({
      id: item.id,
      size: item.size,
      color: item.color,
    });
    const existing = cart.find((c) => getCartItemKey(c) === itemKey);
    if (existing) {
      const cartIntent = {
        id: item.id,
        name: item.name,
        price: item.price,
        image: item.image,
        quantity: 1,
        ...(item.size ? { size: item.size } : {}),
        ...(item.color ? { color: item.color } : {}),
      };
      if (!requireAuthForIntent({ type: "cart", item: cartIntent })) return;
      updateQuantity(
        item.id,
        existing.quantity + 1,
        existing.size,
        existing.color,
      );
      toast.success(`${item.name} quantity updated in cart`);
    } else {
      const cartIntent = { ...item, quantity: 1 as const };
      if (!requireAuthForIntent({ type: "cart", item: cartIntent })) return;
      addToCart(cartIntent);
      toast.success(`${item.name} added to cart!`);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cb-terracotta" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-light text-cb-fg">Wishlist</h1>
        {wishlist.length > 0 && (
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="text-sm font-semibold text-cb-terracotta"
          >
            Clear all
          </button>
        )}
      </div>

      {wishlist.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="mb-6 flex h-[70px] w-[70px] items-center justify-center rounded-full bg-cb-linen">
            <Heart className="h-7 w-7 text-cb-fg" />
          </div>
          <h2 className="text-xl font-light text-cb-fg mb-2">
            Your wishlist is empty
          </h2>
          <p className="text-sm text-cb-muted-fg mb-6 max-w-[260px]">
            Tap the heart on anything you love.
          </p>
          <Button
            asChild
            className="rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white h-[46px] px-6 text-[15px] font-semibold"
          >
            <Link href="/products">Browse products</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-[14px] lg:gap-[18px]">
          {wishlist.map((item) => (
            <div
              key={item.id}
              className="group relative rounded-[18px] overflow-hidden bg-white lg:hover:-translate-y-0.5 transition-transform duration-200"
            >
              <div className="relative aspect-[4/5] overflow-hidden">
                <Link href={`/products/${item.id}`} className="block h-full w-full">
                  <Image
                    src={item.image || images.staticProductImage}
                    alt={item.name}
                    fill
                    sizes="(max-width: 768px) 45vw, 250px"
                    className="object-cover w-full h-full transition-transform duration-500 ease-out group-hover:scale-105"
                  />
                </Link>

                {/* Remove — always visible, top-right */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 z-10 h-[34px] w-[34px] rounded-full bg-white/90 hover:bg-white shadow-md hover:shadow-lg border-0"
                  onClick={() => {
                    removeFromWishlist(item.id);
                    toast.success(`${item.name} removed from wishlist`);
                  }}
                  aria-label="Remove from wishlist"
                >
                  <Heart size={16} className="text-cb-destructive fill-cb-destructive" />
                </Button>

                {/* Add to cart — always visible, bottom-right */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute bottom-2 right-2 z-10 h-[38px] min-w-[38px] rounded-full shadow-md hover:shadow-lg border-0 bg-cb-terracotta hover:bg-cb-terracotta-deep px-2.5"
                  onClick={() => handleAddToCart(item)}
                  aria-label="Add to cart"
                >
                  <Plus className="h-[18px] w-[18px] text-white" />
                </Button>
              </div>

              <div className="pt-[9px] px-[10px] pb-[11px] flex flex-col gap-[5px]">
                <h3 className="text-[13.5px] font-semibold text-cb-fg leading-[1.25] line-clamp-2">
                  <Link href={`/products/${item.id}`}>{item.name}</Link>
                </h3>
                {(item.size || item.color) && (
                  <p className="text-[11.5px] text-cb-muted-fg -mt-0.5">
                    {[item.size, item.color].filter(Boolean).join(" · ")}
                  </p>
                )}
                <DiscountedPrice price={item.price} />
              </div>
            </div>
          ))}
        </div>
      )}
      <WishlistWarningDialog
        wishlist={wishlist}
        showClearConfirm={showClearConfirm}
        setShowClearConfirm={setShowClearConfirm}
        clearWishlist={clearWishlist}
      />
    </div>
  );
}
