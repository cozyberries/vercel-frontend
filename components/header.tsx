"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { navigation } from "@/app/assets/data";
import Image from "next/image";
import { Search, X, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CartSheet from "@/components/CartSheet";
import WishlistSheet from "@/components/WishlistSheet";
import { images } from "@/app/assets/images";
import { useAuth } from "@/components/supabase-auth-provider";
import { HamburgerSheet } from "./HamburgerSheet";
import HeaderLinks from "./HeaderLinks";
import SearchSuggestions from "./SearchSuggestions";
import { useSearchSuggestions } from "@/hooks/useSearchSuggestions";

export default function Header() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const searchRef = useRef<HTMLDivElement>(null);

  // Search suggestions hook
  const {
    suggestions,
    selectedIndex,
    resetSelection,
    selectNext,
    selectPrevious,
    selectIndex,
    getSelectedSuggestion,
  } = useSearchSuggestions(searchQuery, 8);

  // Close search with Esc key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsSearchOpen(false);
        setShowSuggestions(false);
        resetSelection();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [resetSelection]);

  // Show/hide suggestions based on query
  useEffect(() => {
    setShowSuggestions(searchQuery.length >= 2 && suggestions.length > 0);
  }, [searchQuery, suggestions.length]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
        resetSelection();
      }
    };

    if (showSuggestions) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showSuggestions, resetSelection]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
      setIsSearchOpen(false);
      setSearchQuery("");
      setShowSuggestions(false);
      resetSelection();
    }
  };

  const handleSuggestionClick = (suggestion: any) => {
    if (suggestion.type === "product") {
      router.push(`/products/${suggestion.id}`);
    } else {
      router.push(`/products?category=${suggestion.slug}`);
    }
    setIsSearchOpen(false);
    setSearchQuery("");
    setShowSuggestions(false);
    resetSelection();
  };

  const handleSuggestionHover = (index: number) => {
    selectIndex(index);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const selectedSuggestion = getSelectedSuggestion();
      if (selectedSuggestion) {
        handleSuggestionClick(selectedSuggestion);
      } else {
        handleSearch(e);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      selectNext();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectPrevious();
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      resetSelection();
    }
  };

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
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className="z-10"
              data-search-trigger
            >
              {isSearchOpen ? <X /> : <Search />}
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
            <WishlistSheet />
            <CartSheet />
          </div>
        </div>

        {/* Search bar */}
        {isSearchOpen && (
          <div className="fixed top-20 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm border-b py-4">
            <div className="container mx-auto px-4">
              <div className="max-w-md mx-auto">
                <form onSubmit={handleSearch}>
                  <div className="relative" ref={searchRef}>
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Search for products..."
                      className="pl-10"
                      autoFocus
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                    />

                    {/* Search Suggestions */}
                    <SearchSuggestions
                      suggestions={suggestions}
                      selectedIndex={selectedIndex}
                      onSuggestionClick={handleSuggestionClick}
                      onSuggestionHover={handleSuggestionHover}
                      isVisible={showSuggestions}
                      query={searchQuery}
                    />
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
