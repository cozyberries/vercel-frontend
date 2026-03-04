"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWishlist } from "@/components/wishlist-context";
import { useCart, getCartItemKey } from "@/components/cart-context";
import { images } from "@/app/assets/images";
import { toast } from "sonner";

export default function WishlistPage() {
  const { wishlist, removeFromWishlist, clearWishlist, isLoading } =
    useWishlist();
  const { cart, updateQuantity, addToCart } = useCart();

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
      updateQuantity(
        item.id,
        existing.quantity + 1,
        existing.size,
        existing.color,
      );
      toast.success(`${item.name} quantity updated in cart`);
    } else {
      addToCart({ ...item, quantity: 1 });
      toast.success(`${item.name} added to cart!`);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 pt-6 pb-24">
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">
          My Wishlist
          {wishlist.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground ml-2">
              ({wishlist.length} {wishlist.length === 1 ? "item" : "items"})
            </span>
          )}
        </h1>
        {wishlist.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500 hover:text-red-600 hover:bg-red-50"
            onClick={clearWishlist}
          >
            Clear All
          </Button>
        )}
      </div>

      {/* Empty state */}
      {wishlist.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
          <Heart className="h-20 w-20 text-gray-200 mb-6" />
          <h2 className="text-lg font-semibold text-gray-700 mb-2">
            Your wishlist is empty
          </h2>
          <p className="text-gray-500 text-sm mb-6 max-w-[260px]">
            Save items you love by tapping the heart icon on any product
          </p>
          <Button asChild>
            <Link href="/products">Browse Products</Link>
          </Button>
        </div>
      ) : (
        /* Wishlist grid — 2 columns like product listing */
        <div className="grid grid-cols-2 gap-3">
          {wishlist.map((item) => (
            <div
              key={item.id}
              className="group relative flex flex-col bg-white rounded-2xl overflow-hidden shadow-sm active:scale-[0.97] transition-transform duration-150"
            >
              {/* Image */}
              <Link
                href={`/products/${item.id}`}
                className="relative aspect-[4/5] overflow-hidden"
              >
                <Image
                  src={item.image || images.staticProductImage}
                  alt={item.name}
                  fill
                  sizes="(max-width: 768px) 45vw, 250px"
                  className="object-cover"
                />
              </Link>

              {/* Remove button — top right */}
              <button
                onClick={() => {
                  removeFromWishlist(item.id);
                  toast.success(`${item.name} removed from wishlist`);
                }}
                className="absolute top-2 right-2 h-8 w-8 rounded-full bg-white/90 shadow-md flex items-center justify-center hover:bg-red-50 transition-colors"
                aria-label="Remove from wishlist"
              >
                <Trash2 className="h-4 w-4 text-gray-500 hover:text-red-500" />
              </button>

              {/* Content */}
              <div className="p-2.5 flex flex-col gap-1.5">
                <Link href={`/products/${item.id}`}>
                  <h3 className="text-sm font-medium text-gray-900 line-clamp-2 leading-tight">
                    {item.name}
                  </h3>
                </Link>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-900">
                    {"\u20B9"}{item.price.toFixed(2)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full bg-primary/10 hover:bg-primary/20"
                    onClick={() => handleAddToCart(item)}
                    aria-label="Add to cart"
                  >
                    <ShoppingCart className="h-4 w-4 text-primary" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
