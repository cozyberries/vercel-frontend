"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, Package, Tag, Loader2, Heart, Users, Ruler } from "lucide-react";
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
import DiscountedPrice from "@/components/discounted-price";

interface SearchResultsSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SearchSuggestion {
  id: string;
  name: string;
  type: "product" | "category" | "gender" | "size";
  slug?: string;
  image?: string;
  categoryName?: string;
}

/** Safely get price from product (API/cache may return number or string). */
function getProductPrice(p: { price?: unknown } | null): number {
  if (!p || p.price == null) return 0;
  const n = Number(p.price);
  return Number.isFinite(n) ? n : 0;
}

/** Safely get size names from product (handles { name }[] or string[]). */
function getProductSizeNames(p: { sizes?: unknown[] } | null): string[] {
  if (!p || !Array.isArray(p.sizes) || p.sizes.length === 0) return [];
  return p.sizes
    .map((s) => (typeof s === "string" ? s : (s as { name?: string })?.name))
    .filter((name): name is string => typeof name === "string" && name.length > 0);
}

export default function SearchResultsSheet({
  isOpen,
  onOpenChange,
}: SearchResultsSheetProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [topProducts, setTopProducts] = useState<Product[]>([]);
  const [recentSearchItems, setRecentSearchItems] = useState<(Product | null)[]>([]);
  const [recentSearchItemsLoading, setRecentSearchItemsLoading] = useState(false);
  const [topProductsLoading, setTopProductsLoading] = useState(true);

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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch search suggestions with 200ms debounce (Upstash Search)
  const fetchSuggestions = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    setSuggestionsLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search/suggestions?q=${encodeURIComponent(query.trim())}`
        );
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data.suggestions || []);
        } else {
          setSuggestions([]);
        }
      } catch (error) {
        console.error("Error fetching suggestions:", error);
        setSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    }, 200);
  }, []);

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
      try {
        addRecentSearch(query.trim());
      } catch {
        // ignore
      }
    }
  };

  // Recent searches + product cache (localStorage) — persist queries and full product data (price, sizes, etc.)
  const RECENT_KEY = "recent_searches";
  const RECENT_ITEMS_KEY = "search_sheet_recent_items";

  const loadRecentSearches = (): string[] => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as string[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const saveRecentSearches = (arr: string[]) => {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(arr));
    } catch {
      // ignore
    }
  };

  const loadRecentSearchItems = (): (Product | null)[] => {
    try {
      const raw = localStorage.getItem(RECENT_ITEMS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as (Product | null)[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const saveRecentSearchItems = (items: (Product | null)[]) => {
    try {
      localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(items));
    } catch {
      // ignore
    }
  };

  const addRecentSearch = (q: string) => {
    if (!q) return;
    setRecentSearches((prev) => {
      const next = [q, ...prev.filter((p) => p.toLowerCase() !== q.toLowerCase())].slice(0, 8);
      saveRecentSearches(next);
      return next;
    });
  };

  // On mount: load recent searches and cached product items so price/sizes show immediately after refresh
  useEffect(() => {
    try {
      const queries = loadRecentSearches();
      setRecentSearches(queries);
      if (queries.length > 0) {
        const cached = loadRecentSearchItems();
        if (cached.length === queries.length) {
          setRecentSearchItems(cached);
          setRecentSearchItemsLoading(false);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // When recent searches change, fetch product for each query and persist (price, sizes, discount, etc.)
  useEffect(() => {
    if (!recentSearches || recentSearches.length === 0) {
      setRecentSearchItems([]);
      setRecentSearchItemsLoading(false);
      saveRecentSearchItems([]);
      return;
    }

    let mounted = true;
    const cached = loadRecentSearchItems();
    if (cached.length !== recentSearches.length) setRecentSearchItemsLoading(true);
    const loadRecentItems = async () => {
      const promises = recentSearches.map(async (q) => {
        try {
          const res = await fetch(`/api/products?search=${encodeURIComponent(q)}&limit=1`);
          if (!res.ok) return null;
          const data = await res.json();
          return (data.products && data.products.length > 0) ? data.products[0] : null;
        } catch {
          return null;
        }
      });
      const results = await Promise.all(promises);
      if (!mounted) return;
      setRecentSearchItems(results);
      setRecentSearchItemsLoading(false);
      saveRecentSearchItems(results);
    };

    loadRecentItems();
    return () => {
      mounted = false;
    };
  }, [recentSearches]);

  // Top products cache (localStorage) — persist full product data so price/sizes/discount show after refresh
  const TOP_PRODUCTS_KEY = "search_sheet_top_products";

  const loadTopProductsFromStorage = (): Product[] => {
    try {
      const raw = localStorage.getItem(TOP_PRODUCTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Product[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const saveTopProducts = (products: Product[]) => {
    try {
      localStorage.setItem(TOP_PRODUCTS_KEY, JSON.stringify(products));
    } catch {
      // ignore
    }
  };

  // On mount: show cached top products immediately, then fetch fresh and persist
  useEffect(() => {
    const cached = loadTopProductsFromStorage();
    if (cached.length > 0) {
      setTopProducts(cached);
      setTopProductsLoading(false);
    }

    let mounted = true;
    const loadTop = async () => {
      try {
        const res = await fetch("/api/products?limit=6&page=1");
        if (!res.ok) return;
        const data = await res.json();
        const products = data.products || [];
        if (!mounted) return;
        setTopProducts(products);
        saveTopProducts(products);
      } catch {
        // ignore
      } finally {
        if (mounted) setTopProductsLoading(false);
      }
    };
    loadTop();
    return () => {
      mounted = false;
    };
  }, []);

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

  // Handle suggestion click — use slug for URLs (id is namespaced e.g. "product:slug")
  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    if (suggestion.type === "product" && suggestion.name) addRecentSearch(suggestion.name);

    const slug = suggestion.slug ?? suggestion.id.replace(/^[^:]+:/, "");
    const destinations: Record<SearchSuggestion["type"], string> = {
      product: `/products/${slug}`,
      category: `/products?category=${slug}`,
      gender: `/products?gender=${slug}`,
      size: `/products?size=${slug}`,
    };

    window.location.href = destinations[suggestion.type];
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

  // Highlight text: split by query (regex-escaped); odd-index parts are matches (capturing group).
  const highlightText = (text: string, query: string) => {
    if (!query) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, index) =>
      index % 2 === 1 ? (
        <span key={index} className="font-semibold text-primary">
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  // Get suggestion icon per type
  const getSuggestionIcon = (suggestion: SearchSuggestion) => {
    const icons: Record<SearchSuggestion["type"], React.ReactNode> = {
      product: <Package className="w-4 h-4 text-muted-foreground" />,
      category: <Tag className="w-4 h-4 text-muted-foreground" />,
      gender: <Users className="w-4 h-4 text-muted-foreground" />,
      size: <Ruler className="w-4 h-4 text-muted-foreground" />,
    };
    return icons[suggestion.type];
  };

  // Human-readable label shown below suggestion name
  const getSuggestionLabel = (suggestion: SearchSuggestion): string | null => {
    const labels: Partial<Record<SearchSuggestion["type"], string>> = {
      category: "Category",
      gender: "Gender",
      size: "Size",
    };
    return labels[suggestion.type] ?? null;
  };

  // Reset state when sheet closes, clear any pending debounce
  useEffect(() => {
    if (!isOpen) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setSearchQuery("");
      setSearchResults([]);
      setSuggestions([]);
      setShowSuggestions(false);
      setSelectedIndex(-1);
    }
  }, [isOpen]);

  // Clear debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[min(95vw,640px)] p-0">
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

                {/* Search Suggestions (Upstash Search) */}
                {showSuggestions && (suggestionsLoading || suggestions.length > 0 || searchQuery.trim().length >= 2) && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-lg z-50 max-h-[320px] overflow-y-auto">
                    <div className="p-2">
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border/50 mb-2">
                        Suggested
                      </div>

                      {suggestionsLoading ? (
                        <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm">Searching...</span>
                        </div>
                      ) : suggestions.length === 0 ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                          No suggestions for &ldquo;{searchQuery.trim()}&rdquo;
                        </div>
                      ) : (
                        suggestions.map((suggestion, index) => (
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
                            {/* Image (products only) or type icon */}
                            <div className="flex-shrink-0">
                              {suggestion.type === "product" && suggestion.image ? (
                                <div className="relative w-10 h-10 bg-muted rounded-md overflow-hidden">
                                  <Image
                                    src={toImageSrc(suggestion.image)}
                                    alt={suggestion.name}
                                    fill
                                    className="object-cover"
                                    sizes="40px"
                                  />
                                </div>
                              ) : (
                                <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
                                  {getSuggestionIcon(suggestion)}
                                </div>
                              )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-foreground truncate">
                                {highlightText(suggestion.name, searchQuery)}
                              </div>
                              {suggestion.categoryName ? (
                                <div className="text-xs text-muted-foreground truncate">
                                  in {suggestion.categoryName}
                                </div>
                              ) : getSuggestionLabel(suggestion) ? (
                                <div className="text-xs text-muted-foreground truncate">
                                  {getSuggestionLabel(suggestion)}
                                </div>
                              ) : null}
                            </div>

                            <div className="flex-shrink-0">
                              <Search className="w-4 h-4 text-muted-foreground" />
                            </div>
                          </button>
                        ))
                      )}
                    </div>

                    {!suggestionsLoading && suggestions.length > 0 && (
                      <div className="border-t border-border p-2 bg-muted/30">
                        <div className="text-xs text-muted-foreground text-center">
                          Press{" "}
                          <kbd className="px-1 py-0.5 bg-muted rounded text-xs">
                            Enter
                          </kbd>{" "}
                          to search for &ldquo;{searchQuery}&rdquo;
                        </div>
                      </div>
                    )}
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
                  {searchResults.length !== 1 ? "s" : ""} for &ldquo;{searchQuery}&rdquo;
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
                        <Link href={`/products/${product.id}`} onClick={() => onOpenChange(false)}>
                          <Image
                            src={toImageSrc(
                              (product.images?.[0] as any)?.url ?? (product.images?.[0] as any),
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
                        <Link href={`/products/${product.id}`} onClick={() => onOpenChange(false)}>
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
                          ₹{product.price.toFixed(0)}
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
                                image: (product.images?.[0] as any)?.url ?? (product.images?.[0] as any),
                                size: product.sizes?.[0]?.name,
                                color: product.variants?.[0]?.color ?? product.colors?.[0],
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
                  We couldn&apos;t find any products matching &ldquo;{searchQuery}&rdquo;. Try
                  different keywords.
                </p>
              </div>
            ) : (
              <div className="p-4">
                {recentSearches.length > 0 && (
                  <section className="mb-4">
                    <h4 className="text-sm font-medium mb-2">Recent searches</h4>
                    <div className="space-y-2">
                      {recentSearches.map((q, idx) => {
                        const prod = recentSearchItems[idx] ?? null;
                        if (recentSearchItemsLoading && idx >= recentSearchItems.length) {
                          return (
                            <div key={`${q}-${idx}-loading`} className="flex items-center gap-4 p-3 border rounded-lg animate-pulse">
                              <div className="w-14 h-14 rounded bg-muted flex-shrink-0" />
                              <div className="flex-1 min-w-0 space-y-2">
                                <div className="h-4 bg-muted rounded w-3/4" />
                                <div className="h-3 bg-muted rounded w-1/3" />
                              </div>
                            </div>
                          );
                        }
                        if (prod) {
                          const img = (prod.images?.[0] ?? null) as any;
                          const prodImgSrc = (img as any)?.url ?? (img as any) ?? null;
                          const inWishlistRecent = isInWishlist(prod.id);
                          return (
                            <div
                              key={`${q}-${idx}`}
                              className="flex items-center gap-4 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                            >
                              <Link
                                href={`/products/${prod.id}`}
                                onClick={() => onOpenChange(false)}
                                className="flex items-center gap-4 flex-1 min-w-0"
                              >
                                <div className="w-14 h-14 rounded overflow-hidden bg-muted flex-shrink-0">
                                  <Image
                                    src={toImageSrc(prodImgSrc, images.staticProductImage)}
                                    alt={prod.name}
                                    width={56}
                                    height={56}
                                    className="object-cover w-full h-full"
                                  />
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">
                                    {prod.name}
                                  </div>
                                  <div className="mt-1">
                                    <DiscountedPrice
                                      price={getProductPrice(prod)}
                                      className="text-sm font-medium"
                                    />
                                  </div>
                                  {getProductSizeNames(prod).length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                      {getProductSizeNames(prod).map((name) => (
                                        <span
                                          key={name}
                                          className="inline-block px-2 py-0.5 text-xs font-medium bg-muted rounded border border-border"
                                        >
                                          {name}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </Link>

                              <div className="flex-shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    if (inWishlistRecent) {
                                      removeFromWishlist(prod.id);
                                      toast.success(`${prod.name} removed from wishlist!`);
                                    } else {
                                      addToWishlist({
                                        id: prod.id,
                                        name: prod.name,
                                        price: getProductPrice(prod),
                                        image: prodImgSrc,
                                        size: prod.sizes?.[0]?.name,
                                        color: prod.variants?.[0]?.color ?? prod.colors?.[0],
                                      });
                                      toast.success(`${prod.name} added to wishlist!`);
                                    }
                                  }}
                                >
                                  <Heart
                                    className={`h-4 w-4 ${
                                      inWishlistRecent ? "fill-red-500 text-red-500" : ""
                                    }`}
                                  />
                                </Button>
                              </div>
                            </div>
                          );
                        }
                        // fallback to simple button if no product found
                        return (
                          <button
                            key={`${q}-${idx}`}
                            onClick={() => {
                              setSearchQuery(q);
                              performSearch(q);
                              onOpenChange(false);
                            }}
                            aria-label={`Search for ${q}`}
                            className="px-3 py-1 rounded bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            {q}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}

                <section>
                  <h4 className="text-sm font-medium mb-2">Top products</h4>
                  <div className="space-y-2">
                    {topProductsLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <div key={`top-skeleton-${i}`} className="flex items-center gap-4 p-3 border rounded-lg animate-pulse">
                          <div className="w-14 h-14 rounded bg-muted flex-shrink-0" />
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="h-4 bg-muted rounded w-2/3" />
                            <div className="h-3 bg-muted rounded w-1/4" />
                          </div>
                        </div>
                      ))
                    ) : (
                    topProducts.slice(0, 6).map((p) => {
                      const img = (p.images?.[0] ?? null) as any;
                      const productImageSrc =
                        (img as any)?.url ?? (img as any) ?? null;
                      const inWishlistTop = isInWishlist(p.id);
                      return (
                        <div
                          key={p.id}
                          className="flex items-center gap-4 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <Link
                            href={`/products/${p.id}`}
                            onClick={() => onOpenChange(false)}
                            className="flex items-center gap-4 flex-1 min-w-0"
                          >
                            <div className="w-14 h-14 rounded overflow-hidden bg-muted flex-shrink-0">
                              <Image
                                src={toImageSrc(productImageSrc, images.staticProductImage)}
                                alt={p.name}
                                width={56}
                                height={56}
                                className="object-cover w-full h-full"
                              />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                {p.name}
                              </div>
                              <div className="mt-1">
                                <DiscountedPrice
                                  price={getProductPrice(p)}
                                  className="text-sm font-medium"
                                />
                              </div>
                              {getProductSizeNames(p).length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {getProductSizeNames(p).map((name) => (
                                    <span
                                      key={name}
                                      className="inline-block px-2 py-0.5 text-xs font-medium bg-muted rounded border border-border"
                                    >
                                      {name}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </Link>

                          <div className="flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                if (inWishlistTop) {
                                  removeFromWishlist(p.id);
                                  toast.success(`${p.name} removed from wishlist!`);
                                } else {
                                  addToWishlist({
                                    id: p.id,
                                    name: p.name,
                                    price: getProductPrice(p),
                                    image: productImageSrc,
                                    size: p.sizes?.[0]?.name,
                                    color: p.variants?.[0]?.color ?? p.colors?.[0],
                                  });
                                  toast.success(`${p.name} added to wishlist!`);
                                }
                              }}
                            >
                              <Heart
                                className={`h-4 w-4 ${
                                  inWishlistTop ? "fill-red-500 text-red-500" : ""
                                }`}
                              />
                            </Button>
                          </div>
                        </div>
                      );
                    })
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
