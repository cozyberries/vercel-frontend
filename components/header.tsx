"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigation } from "@/app/assets/data";
import Image from "next/image";
import { Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import CartSheet from "@/components/CartSheet";
import WishlistSheet from "@/components/WishlistSheet";
import SearchResultsSheet from "@/components/SearchResultsSheet";
import { images } from "@/app/assets/images";
import { useAuth } from "@/components/supabase-auth-provider";
import { HamburgerSheet } from "./HamburgerSheet";
import HeaderLinks from "./HeaderLinks";

export default function Header() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-50 bg-background/95 border-b backdrop-blur-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-20">
          {/* Mobile menu */}
          <HamburgerSheet />

          {/* Logo */}
          <div className="flex-1 lg:relative fixed flex w-full left-0 items-center justify-center lg:justify-start h-full">
            <Link href="/" className="flex items-center h-full">
              <Image
                src={images.logoURL}
                alt="CozyBerries"
                width={180}
                height={50}
                className="h-full w-auto object-contain"
              />
            </Link>
          </div>

          {/* Desktop navigation */}
          <nav className="hidden lg:flex items-center justify-center flex-1">
            <ul className="flex space-x-8">
              {navigation.map((item) => {
                // Skip orders link if user is not authenticated
                if (item.href === "/orders" && !user) {
                  return null;
                }

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
            {/* Search toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSearchOpen(true)}
              className="z-10"
              data-search-trigger
            >
              <Search />
              <span className="sr-only">Search</span>
            </Button>

            {/* User Icon */}
            <div className="hidden lg:block">
              <Link href={user ? "/profile" : "/login"}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors duration-200"
                  aria-label={user ? "Go to profile" : "Go to login"}
                >
                  <User />
                </Button>
              </Link>
            </div>

            {/* Admin Link - Only visible when user is logged in */}
            {user && (
              <div className="hidden lg:block">
                <Link href="/admin">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                  >
                    Admin
                  </Button>
                </Link>
              </div>
            )}
            <WishlistSheet />
            <CartSheet />
          </div>
        </div>
      </div>

      {/* Search Results Sheet */}
      <SearchResultsSheet
        isOpen={isSearchOpen}
        onOpenChange={setIsSearchOpen}
      />
    </header>
  );
}
