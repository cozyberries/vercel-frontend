"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigation } from "@/app/assets/data";
import Image from "next/image";
import { User, Search, X, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CartSheet from "@/components/CartSheet";
import WishlistSheet from "@/components/WishlistSheet";
import { images } from "@/app/assets/images";
import { useUser } from "@auth0/nextjs-auth0/client";
import { HamburgerSheet } from "./HamburgerSheet";

export default function Header() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useUser();

  // Close search with Esc key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsSearchOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <header className="bg-background border-b">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-20">
          {/* Mobile menu */}
          <HamburgerSheet />

          {/* Logo */}
          <div className="flex-1 flex items-center justify-center lg:justify-start">
            <Link href="/" className="flex items-center">
              <Image
                src={images.logoURL}
                alt="CozyBerries"
                width={180}
                height={50}
                className="h-12 w-auto"
              />
            </Link>
          </div>

          {/* Desktop navigation */}
          <nav className="hidden lg:flex items-center justify-center flex-1">
            <ul className="flex space-x-8">
              {navigation.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);

                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={`group relative text-sm font-medium transition-colors ${
                        isActive
                          ? "text-primary"
                          : "text-foreground/80 hover:text-primary"
                      }`}
                    >
                      {item.name}
                      <span
                        className={`absolute left-0 -bottom-1 h-0.5 w-full origin-left scale-x-0 bg-primary transition-transform duration-200 ${
                          isActive ? "scale-x-100" : "group-hover:scale-x-100"
                        }`}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Icons + Auth */}
          <div className="flex items-center justify-end flex-1 space-x-4">
            {/* Search toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSearchOpen(!isSearchOpen)}
            >
              {isSearchOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Search className="h-5 w-5" />
              )}
              <span className="sr-only">Search</span>
            </Button>

            {/* Auth buttons */}
            {!user ? (
              <Button variant="ghost" asChild>
                <Link href="/api/auth/login">Login</Link>
              </Button>
            ) : (
              <>
                {/* User Profile */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden sm:flex"
                  asChild
                >
                  <Link href="/profile" aria-label="Profile">
                    <User className="h-5 w-5" />
                  </Link>
                </Button>
              </>
            )}

            <WishlistSheet />
            <CartSheet />
          </div>
        </div>

        {/* Search bar */}
        {isSearchOpen && (
          <div className="py-4 border-t">
            <div className="max-w-md mx-auto">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search for products..."
                  className="pl-10"
                  autoFocus
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
