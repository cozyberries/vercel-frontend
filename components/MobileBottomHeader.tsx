"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, ShoppingBag, Heart, Package, Home, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useWishlist } from "@/components/wishlist-context";
import { useCart } from "@/components/cart-context";
import { useAuth } from "@/components/supabase-auth-provider";
import WishlistItem from "@/components/WishlistItem";

export default function MobileBottomHeader() {
  const pathname = usePathname();
  const { wishlist, removeFromWishlist, clearWishlist, isLoading } =
    useWishlist();
  const { cart, updateQuantity } = useCart();
  const { user } = useAuth();

  const handleAddToCart = (item: {
    id: string;
    name: string;
    price: number;
    image?: string;
  }) => {
    const existing = cart.find((c) => c.id === item.id);
    if (existing) {
      updateQuantity(item.id, existing.quantity + 1);
    } else {
      if (
        typeof window !== "undefined" &&
        typeof window.dispatchEvent === "function"
      ) {
        window.dispatchEvent(
          new CustomEvent("cart:add", { detail: { ...item, quantity: 1 } })
        );
      }
    }
  };

  const [isWishlistOpen, setIsWishlistOpen] = useState(false);

  const navItems = [
    {
      name: "Home",
      href: "/",
      icon: Home,
      isActive: pathname === "/",
    },
    {
      name: "Products",
      href: "/products",
      icon: ShoppingBag,
      isActive: pathname.startsWith("/products"),
    },
    {
      name: "Wishlist",
      icon: Heart,
      isActive: false, // Wishlist sheet doesn't have a dedicated page route
      badge: wishlist.length > 0 ? wishlist.length : null,
      onClick: () => setIsWishlistOpen(true),
    },
    ...(user
      ? [
          {
            name: "Orders",
            href: "/orders",
            icon: Package,
            isActive: pathname.startsWith("/orders"),
          },
        ]
      : []),
    {
      name: "Profile",
      href: user ? "/profile" : "/login",
      icon: User,
      isActive: pathname.startsWith("/profile") || pathname.startsWith("/login"),
    },
  ];

  return (
    <>
      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 lg:hidden">
        <div
          className={`grid h-16 ${navItems.length === 4 ? "grid-cols-4" : "grid-cols-5"}`}
        >
          {/* Navigation Items */}
          {navItems.map((item) => {
            const Icon = item.icon;
            const className = `flex flex-col items-center justify-center space-y-1 relative transition-colors duration-200 ${
              item.isActive
                ? "text-primary bg-primary/5"
                : "text-gray-600 hover:text-primary hover:bg-gray-50"
            }`;

            // If item has onClick handler, render as button
            if (item.onClick) {
              return (
                <button
                  key={item.name}
                  onClick={item.onClick}
                  className={className}
                >
                  <div className="relative">
                    <Icon className="h-6 w-6" />
                    {item.badge && (
                      <span className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full text-xs w-5 h-5 flex items-center justify-center">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-medium">{item.name}</span>
                </button>
              );
            }

            // Otherwise render as Link
            return (
              <Link key={item.name} href={item.href!} className={className}>
                <div className="relative">
                  <Icon className="h-6 w-6" />
                  {"badge" in item && (item as any).badge && (
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full text-xs w-5 h-5 flex items-center justify-center">
                      {(item as any).badge}
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Bottom padding for content to avoid overlap */}
      <div className="h-16 lg:hidden" />

      {/* Wishlist Sheet */}
      <Sheet open={isWishlistOpen} onOpenChange={setIsWishlistOpen}>
        <SheetContent side="right" className="w-[350px] sm:w-[400px] p-0">
          <div className="flex h-full flex-col">
            <SheetHeader className="p-4 border-b">
              <SheetTitle>Your Wishlist</SheetTitle>
            </SheetHeader>
            {wishlist.length !== 0 && (
              <div className="flex justify-end">
                <Button
                  variant={"link"}
                  className="w-fit text-red-400"
                  onClick={clearWishlist}
                >
                  Clear All
                </Button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : wishlist.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                  <Heart className="h-16 w-16 text-gray-300 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-600 mb-2">
                    Your wishlist is empty
                  </h3>
                  <p className="text-gray-500 text-sm">
                    Save items you love for later by clicking the heart icon
                  </p>
                </div>
              ) : (
                <div className="p-4 space-y-4">
                  {wishlist.map((item) => (
                    <WishlistItem
                      key={item.id}
                      item={item}
                      onAddToCart={handleAddToCart}
                      onRemove={removeFromWishlist}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
