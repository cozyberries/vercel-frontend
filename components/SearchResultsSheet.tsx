"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, X, Package, Tag, Loader2, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Product } from "@/lib/services/api";
import { images } from "@/app/assets/images";
import { toImageSrc } from "@/lib/utils/image";
import { useWishlist } from "./wishlist-context";
import { toast } from "sonner";

interface SearchResultsSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SearchSuggestion {
  id: string;
  name: string;
  type: "product" | "category";
  slug?: string;
  image?: string;
  categoryName?: string;
}

export default function SearchResultsSheet({
  isOpen,
  onOpenChange,
}: SearchResultsSheetProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    };

    if (showSuggestions) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showSuggestions]);

  // Fetch search suggestions
  const fetchSuggestions = async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    try {
      const response = await fetch(
        `/api/search/suggestions?q=${encodeURIComponent(query)}`
      );
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error("Error fetching suggestions:", error);
    }
  };

  // Perform search
  const performSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/products?search=${encodeURIComponent(query.trim())}&limit=20`
      );
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.products || []);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error("Error searching products:", error);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setSelectedIndex(-1);

    if (value.length >= 2) {
      fetchSuggestions(value);
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // Handle search form submission
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      performSearch(searchQuery.trim());
      setShowSuggestions(false);
      setSelectedIndex(-1);
    }
  };

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    if (suggestion.type === "product") {
      // Navigate to product page
      window.location.href = `/products/${suggestion.id}`;
    } else {
      // Navigate to category page
      window.location.href = `/products?category=${suggestion.slug}`;
    }
    onOpenChange(false);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        handleSuggestionClick(suggestions[selectedIndex]);
      } else {
        handleSearch(e);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setSelectedIndex(-1);
    }
  };

  // Handle suggestion hover
  const handleSuggestionHover = (index: number) => {
    setSelectedIndex(index);
  };

  // Highlight text function
  const highlightText = (text: string, query: string) => {
    if (!query) return text;

    const regex = new RegExp(`(${query})`, "gi");
    const parts = text.split(regex);

    return parts.map((part, index) =>
      regex.test(part) ? (
        <span key={index} className="font-semibold text-primary">
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  // Get suggestion icon
  const getSuggestionIcon = (suggestion: SearchSuggestion) => {
    if (suggestion.type === "product") {
      return <Package className="w-4 h-4 text-muted-foreground" />;
    } else {
      return <Tag className="w-4 h-4 text-muted-foreground" />;
    }
  };

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setSearchResults([]);
      setSuggestions([]);
      setShowSuggestions(false);
      setSelectedIndex(-1);
    }
  }, [isOpen]);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[500px] p-0">
        <div className="flex h-full flex-col">
          <SheetHeader className="p-4 border-b">
            <SheetTitle>Search Products</SheetTitle>
          </SheetHeader>

          {/* Search Input */}
          <div className="p-4 border-b">
            <form onSubmit={handleSearch}>
              <div className="relative" ref={searchRef}>
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search for products..."
                  className="pl-10"
                  autoFocus
                  value={searchQuery}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                />

                {/* Search Suggestions */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                    <div className="p-2">
                      {suggestions.map((suggestion, index) => (
                        <button
                          key={`${suggestion.type}-${suggestion.id}`}
                          onClick={() => handleSuggestionClick(suggestion)}
                          onMouseEnter={() => handleSuggestionHover(index)}
                          className={`w-full flex items-center gap-3 p-3 rounded-md transition-colors text-left ${
                            selectedIndex === index
                              ? "bg-primary/10 border border-primary/20"
                              : "hover:bg-muted/50"
                          }`}
                        >
                          {/* Icon */}
                          <div className="flex-shrink-0">
                            {getSuggestionIcon(suggestion)}
                          </div>

                          {/* Image (for products) */}
                          {suggestion.type === "product" &&
                            suggestion.image && (
                              <div className="relative w-10 h-10 bg-muted rounded-md overflow-hidden flex-shrink-0">
                                <Image
                                  src={toImageSrc(suggestion.image)}
                                  alt={suggestion.name}
                                  fill
                                  className="object-cover"
                                />
                              </div>
                            )}

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">
                              {highlightText(suggestion.name, searchQuery)}
                            </div>
                            {suggestion.type === "product" &&
                              suggestion.categoryName && (
                                <div className="text-xs text-muted-foreground truncate">
                                  in {suggestion.categoryName}
                                </div>
                              )}
                            {suggestion.type === "category" && (
                              <div className="text-xs text-muted-foreground">
                                Category
                              </div>
                            )}
                          </div>

                          {/* Type indicator */}
                          <div className="flex-shrink-0">
                            <Search className="w-4 h-4 text-muted-foreground" />
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Footer with search hint */}
                    <div className="border-t border-border p-2 bg-muted/30">
                      <div className="text-xs text-muted-foreground text-center">
                        Press{" "}
                        <kbd className="px-1 py-0.5 bg-muted rounded text-xs">
                          Enter
                        </kbd>{" "}
                        to search for "{searchQuery}"
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </form>
          </div>

          {/* Search Results */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : searchResults.length > 0 ? (
              <div className="p-4 space-y-4">
                <div className="text-sm text-muted-foreground mb-4">
                  Found {searchResults.length} product
                  {searchResults.length !== 1 ? "s" : ""} for "{searchQuery}"
                </div>
                {searchResults.map((product) => {
                  const inWishlist = isInWishlist(product.id);

                  return (
                    <div
                      key={product.id}
                      className="flex gap-4 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      {/* Product Image */}
                      <div className="relative w-16 h-16 bg-muted rounded-md overflow-hidden flex-shrink-0">
                        <Link href={`/products/${product.id}`}>
                          <Image
                            src={toImageSrc(
                              product.images?.[0]?.url ?? product.images?.[0],
                              images.staticProductImage
                            )}
                            alt={product.name}
                            fill
                            className="object-cover"
                          />
                        </Link>
                      </div>

                      {/* Product Info */}
                      <div className="flex-1 min-w-0">
                        <Link href={`/products/${product.id}`}>
                          <h3 className="font-medium text-sm hover:text-primary transition-colors">
                            {highlightText(product.name, searchQuery)}
                          </h3>
                        </Link>
                        {product.category &&
                          product.category !== "Uncategorized" && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {product.category}
                            </p>
                          )}
                        <p className="font-medium text-sm mt-1">
                          ₹{product.price.toFixed(2)}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            if (inWishlist) {
                              removeFromWishlist(product.id);
                              toast.success(
                                `${product.name} removed from wishlist!`
                              );
                            } else {
                              addToWishlist({
                                id: product.id,
                                name: product.name,
                                price: product.price,
                                image: product.images?.[0]?.url,
                              });
                              toast.success(
                                `${product.name} added to wishlist!`
                              );
                            }
                          }}
                        >
                          <Heart
                            className={`h-4 w-4 ${
                              inWishlist ? "fill-red-500 text-red-500" : ""
                            }`}
                          />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : searchQuery ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <Search className="h-16 w-16 text-gray-300 mb-4" />
                <h3 className="text-lg font-semibold text-gray-600 mb-2">
                  No products found
                </h3>
                <p className="text-gray-500 text-sm">
                  We couldn't find any products matching "{searchQuery}". Try
                  different keywords.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <Search className="h-16 w-16 text-gray-300 mb-4" />
                <h3 className="text-lg font-semibold text-gray-600 mb-2">
                  Start searching
                </h3>
                <p className="text-gray-500 text-sm">
                  Enter a product name or category to find what you're looking
                  for.
                </p>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
