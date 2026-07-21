"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigation } from "@/app/assets/data";
import Image from "next/image";
import { User, Search, Heart, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import NotificationCenter from "@/components/NotificationCenter";
import { images } from "@/app/assets/images";
import { useWishlist } from "@/components/wishlist-context";
import { useCart } from "@/components/cart-context";
import { useAuth } from "@/components/supabase-auth-provider";
import { useProfileCombined } from "@/hooks/useApiQueries";
import { HamburgerSheet } from "./HamburgerSheet";
import HeaderLinks from "./HeaderLinks";

export default function Header() {
  const pathname = usePathname();
  const { wishlist } = useWishlist();
  const { cart } = useCart();
  const cartQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  const { user } = useAuth();
  const { data: profileData } = useProfileCombined(user?.id);
  const initials = (profileData?.profile?.full_name || user?.email || "")
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-50 bg-background/95 border-b backdrop-blur-sm">
      <div className="container mx-auto px-4 py-1">
        <div className="relative flex items-center justify-between h-14 lg:h-20">
          {/* Desktop hamburger (kept for desktop sidebar if needed in future) */}
          <div className="hidden lg:block">
            <HamburgerSheet />
          </div>

          {/* Logo — left-aligned at every breakpoint */}
          <div className="flex items-center h-full">
            <Link href="/" className="flex items-center h-full">
              <Image
                src={images.logoURL}
                alt="CozyBerries"
                width={180}
                height={50}
                className="h-full w-auto object-contain"
                priority
              />
            </Link>
          </div>

          {/* Desktop navigation — sits left, right after the logo */}
          <nav className="hidden lg:flex items-center ml-10">
            <ul className="flex items-center gap-2">
              {navigation.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);

                return (
                  <HeaderLinks
                    key={item.name}
                    name={item.name}
                    href={item.href}
                    isActive={isActive}
                  />
                );
              })}
            </ul>
          </nav>

          {/* Icons + Auth */}
          <div className="flex items-center justify-end flex-1 space-x-1">
            {/* Search — hidden on /products (inline search bar takes over) */}
            {pathname !== '/products' && (
              <Link href="/products">
                <Button
                  variant="ghost"
                  size="icon"
                  className="flex items-center justify-center rounded-full hover:bg-cb-muted transition-colors duration-200"
                  aria-label="Search products"
                >
                  <Search className="h-5 w-5" />
                </Button>
              </Link>
            )}
            <NotificationCenter />
            <Link href="/wishlist">
              <Button
                variant="ghost"
                size="icon"
                className="relative lg:h-10 lg:w-10 h-12 w-12"
                aria-label="Go to wishlist"
              >
                <Heart className={`h-6 w-6 lg:h-5 lg:w-5 ${wishlist.length > 0 ? "fill-red-500 text-red-500" : ""}`} />
                {wishlist.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-pink-500 text-white rounded-full text-xs w-5 h-5 flex items-center justify-center">
                    {wishlist.length}
                  </span>
                )}
              </Button>
            </Link>
            <Link href="/cart">
              <Button
                variant="ghost"
                size="icon"
                className="relative lg:w-10 lg:h-10 w-12 h-12"
                aria-label="Go to cart"
              >
                <ShoppingBag className="h-6 w-6 lg:h-5 lg:w-5" />
                {cartQuantity > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-white rounded-full text-xs w-5 h-5 flex items-center justify-center">
                    {cartQuantity}
                  </span>
                )}
              </Button>
            </Link>
            <Link href="/profile">
              {user && initials ? (
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-cb-taupe text-white text-sm font-semibold ring-2 ring-cb-terracotta/40"
                  aria-label="Go to profile"
                >
                  {initials}
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="flex items-center justify-center rounded-full bg-cb-muted hover:bg-cb-mauve-tint transition-colors duration-200"
                  aria-label="Go to profile"
                >
                  <User className="h-4 w-4" />
                </Button>
              )}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
