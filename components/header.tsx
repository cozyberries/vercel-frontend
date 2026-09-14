"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FOCUS_SEARCH_EVENT, searchIconAction } from "@/lib/utils/search-navigation";
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
  const router = useRouter();
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
                className="h-12 w-auto object-contain"
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
          <div className="flex items-center justify-end flex-1 space-x-2 lg:space-x-3">
            {/* On /products this only focuses the search box, so applied filters survive. */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 lg:h-7 lg:w-7 flex items-center justify-center rounded-full hover:bg-transparent"
              aria-label="Search products"
              onClick={() => {
                const action = searchIconAction(pathname ?? "/");
                if (action.kind === "focus") window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT));
                else router.push(action.href);
              }}
            >
              <Search className="!w-5 !h-5 text-cb-fg" />
            </Button>
            <NotificationCenter />
            <Link href="/wishlist">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 lg:h-7 lg:w-7 relative rounded-full hover:bg-transparent"
                aria-label="Go to wishlist"
              >
                <Heart className="!w-5 !h-5 text-cb-fg" />
                {wishlist.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-cb-terracotta text-white rounded-full text-xs w-5 h-5 flex items-center justify-center">
                    {wishlist.length}
                  </span>
                )}
              </Button>
            </Link>
            <Link href="/cart">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 lg:h-7 lg:w-7 relative rounded-full hover:bg-transparent"
                aria-label="Go to cart"
              >
                <ShoppingBag className="!w-5 !h-5 text-cb-fg" />
                {cartQuantity > 0 && (
                  <span className="absolute -top-1 -right-1 bg-cb-terracotta text-white rounded-full text-xs w-5 h-5 flex items-center justify-center">
                    {cartQuantity}
                  </span>
                )}
              </Button>
            </Link>
            <Link href="/profile">
              {user && initials ? (
                <span
                  className="flex h-8 w-8 lg:h-7 lg:w-7 items-center justify-center rounded-full bg-cb-taupe text-white text-xs font-semibold ring-2 ring-cb-terracotta/40"
                  aria-label="Go to profile"
                >
                  {initials}
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 lg:h-7 lg:w-7 flex items-center justify-center rounded-full bg-cb-muted hover:bg-cb-muted"
                  aria-label="Go to profile"
                >
                  <User className="!w-5 !h-5 text-cb-fg" />
                </Button>
              )}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
