"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigation } from "@/app/assets/data";
import Image from "next/image";
import { User } from "lucide-react";
import { Button } from "@/components/ui/button";
import CartSheet from "@/components/CartSheet";
import WishlistSheet from "@/components/WishlistSheet";
import { images } from "@/app/assets/images";
import { useAuth } from "@/components/supabase-auth-provider";
import { HamburgerSheet } from "./HamburgerSheet";
import HeaderLinks from "./HeaderLinks";

export default function Header() {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-50 bg-background/95 border-b backdrop-blur-sm">
      <div className="container mx-auto px-4">
        <div className="relative flex items-center justify-between h-14 lg:h-20">
          {/* Desktop hamburger (kept for desktop sidebar if needed in future) */}
          <div className="hidden lg:block">
            <HamburgerSheet />
          </div>

          {/* Logo — centred on mobile via absolute positioning inside the header row */}
          <div className="absolute left-1/2 -translate-x-1/2 lg:static lg:translate-x-0 lg:flex-1 flex items-center h-full">
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
            {/* User Icon — desktop only */}
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
            {/* Wishlist — desktop only (mobile uses bottom nav) */}
            <div className="hidden lg:block">
              <WishlistSheet />
            </div>
            <CartSheet />
          </div>
        </div>
      </div>
    </header>
  );
}
