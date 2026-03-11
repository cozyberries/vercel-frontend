"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ProductCard from "@/components/product-card";
import ProductCardSkeleton from "@/components/product-card-skeleton";
import FilterSheet from "@/components/FilterSheet";
import { getProducts, getCategoryOptions, getSizeOptions, getGenderOptions, CategoryOption, SizeOptionFilter, GenderOptionFilter, Product } from "@/lib/services/api";
import { Loader, Search, X, RotateCcw, LayoutGrid, LayoutList } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";

const PAGE_SIZE_MOBILE = 10;
const PAGE_SIZE_DESKTOP = 12;

function parseApiError(err: unknown, fallback: string): string {
  const data =
    err &&
    typeof err === "object" &&
    "response" in err
      ? (err as { response?: { data?: { error?: string; details?: string } } })
          .response?.data
      : null;
  if (data?.error) {
    return data.details ? `${data.error}: ${data.details}` : data.error;
  }
  return err instanceof Error ? err.message : fallback;
}

/* ─── Extracted search input ─── */
interface ProductSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClear: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  disabled?: boolean;
  className?: string;
}

function ProductSearchInput({
  value,
  onChange,
  onSubmit,
  onClear,
  inputRef,
  disabled = false,
  className,
}: ProductSearchInputProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled) onSubmit(e);
      }}
      className={className}
    >
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search products..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="pl-9 pr-8 h-10"
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {disabled && (
          <Loader className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-pulse text-muted-foreground" />
        )}
      </div>
    </form>
  );
}

export default function ProductsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  // null while viewport is unknown (SSR / first render) — avoids double-fetch
  const pageSize = isMobile === null ? null : isMobile ? PAGE_SIZE_MOBILE : PAGE_SIZE_DESKTOP;

  // Lightweight category options (id, name, slug only — no images/descriptions)
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  // Size options for filter
  const [sizeOptions, setSizeOptions] = useState<SizeOptionFilter[]>([]);
  const [sizeOptionsLoading, setSizeOptionsLoading] = useState(true);

  // Gender options for filter
  const [genderOptions, setGenderOptions] = useState<GenderOptionFilter[]>([]);
  const [genderOptionsLoading, setGenderOptionsLoading] = useState(true);

  // Error source tracking for reliable retry logic
  const [errorSource, setErrorSource] = useState<'categories' | 'products' | null>(null);

  const fetchCategories = useCallback(async () => {
    setCategoriesLoading(true);
    setCategoriesError(null);
    setErrorSource(null);
    try {
      const data = await getCategoryOptions();
      setCategories(
        data.filter(
          (c) =>
            c.slug !== "accessories" && c.slug !== "newborn-accessories"
        )
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load categories";
      setCategoriesError(errorMessage);
      setErrorSource('categories');
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  const fetchSizeOptions = useCallback(async () => {
    setSizeOptionsLoading(true);
    try {
      const data = await getSizeOptions();
      setSizeOptions(data);
    } catch {
      setSizeOptions([]);
    } finally {
      setSizeOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const fetchGenderOptions = useCallback(async () => {
    setGenderOptionsLoading(true);
    try {
      const data = await getGenderOptions();
      setGenderOptions(data);
    } catch {
      setGenderOptions([]);
    } finally {
      setGenderOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSizeOptions();
  }, [fetchSizeOptions]);

  useEffect(() => {
    fetchGenderOptions();
  }, [fetchGenderOptions]);

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalItems, setTotalItems] = useState(0);

  // Inline search input (local state, only applied on submit)
  const [searchInput, setSearchInput] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Infinite scroll sentinel ref
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Scroll restore when returning from product detail: index to scroll into view
  const scrollRestoreIndexRef = useRef<number | null>(null);
  const haveReadScrollRestoreRef = useRef(false);

  // Get current URL parameters
  const currentSort = searchParams.get("sortBy") || "default";
  const currentSortOrder = searchParams.get("sortOrder") || "desc";
  const currentCategory = searchParams.get("category") || "all";
  const currentSize = searchParams.get("size") || "all";
  const currentGender = searchParams.get("gender") || "all";
  const currentAge = searchParams.get("age") || "all";
  const currentSearch = searchParams.get("search") || "";
  const currentFeatured = searchParams.get("featured") === "true";
  // Grid/list view only on mobile; desktop always uses grid. "view" query is mobile-only.
  const currentView = searchParams.get("view") === "list" ? "list" : "grid";
  const effectiveView = isMobile === true && currentView === "list" ? "list" : "grid";

  // On desktop, strip view param from URL so we don't show view=list in the query
  useEffect(() => {
    if (isMobile === false && searchParams.get("view")) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("view");
      const q = params.toString();
      router.replace(q ? `/products?${q}` : "/products");
    }
  }, [isMobile, searchParams, router]);

  // Sync local search input with URL param
  useEffect(() => {
    setSearchInput(currentSearch);
  }, [currentSearch]);

  // Scroll to top when landing on products page or when any filter/category/age changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [searchParams.toString()]);

  // Load products with server-side filtering, sorting, and search
  useEffect(() => {
    // Wait until viewport is known so we fetch with the correct page size (once)
    if (pageSize === null) return;

    const loadProducts = async () => {
      try {
        setIsLoading(true);
        setError(null);
        setErrorSource(null);
        setCurrentPage(1);
        setAllProducts([]);

        const response = await getProducts({
          limit: pageSize,
          page: 1,
          category: currentCategory !== "all" ? currentCategory : undefined,
          size: currentSize !== "all" ? currentSize : undefined,
          gender: currentGender !== "all" ? currentGender : undefined,
          age: currentAge !== "all" ? currentAge : undefined,
          sortBy: currentSort !== "default" ? currentSort : undefined,
          sortOrder: currentSortOrder,
          featured: currentFeatured || undefined,
          search: currentSearch || undefined,
        });

        // Ensure no duplicate products from the initial load
        const uniqueProducts = response.products.filter(
          (product, index, self) =>
            index === self.findIndex((p) => p.id === product.id)
        );
        setAllProducts(uniqueProducts);
        setTotalItems(response.pagination.totalItems);
        setHasMoreProducts(response.pagination.hasNextPage);
      } catch (err: unknown) {
        console.error("Error loading products:", err);
        setError(parseApiError(err, "Failed to load products"));
        setErrorSource('products');
        setAllProducts([]);
        setTotalItems(0);
        setHasMoreProducts(false);
      } finally {
        setIsLoading(false);
      }
    };

    loadProducts();
  }, [currentSort, currentSortOrder, currentCategory, currentSize, currentGender, currentAge, currentFeatured, currentSearch, pageSize]);

  // Load more products function
  const loadMoreProducts = useCallback(async () => {
    if (isLoadingMore || !hasMoreProducts || pageSize === null) return;

    try {
      setIsLoadingMore(true);
      const nextPage = currentPage + 1;

      const response = await getProducts({
        limit: pageSize,
        page: nextPage,
        category: currentCategory !== "all" ? currentCategory : undefined,
        size: currentSize !== "all" ? currentSize : undefined,
        gender: currentGender !== "all" ? currentGender : undefined,
        age: currentAge !== "all" ? currentAge : undefined,
        sortBy: currentSort !== "default" ? currentSort : undefined,
        sortOrder: currentSortOrder,
        featured: currentFeatured || undefined,
        search: currentSearch || undefined,
      });

      setAllProducts((prev) => {
        // Create a Map to track unique products by ID
        const productMap = new Map();

        // Add existing products to the map
        prev.forEach((product) => {
          productMap.set(product.id, product);
        });

        // Add new products, skipping duplicates
        response.products.forEach((product) => {
          if (!productMap.has(product.id)) {
            productMap.set(product.id, product);
          }
        });

        // Convert back to array
        return Array.from(productMap.values());
      });
      setCurrentPage(nextPage);
      setHasMoreProducts(response.pagination.hasNextPage);
    } catch (err: unknown) {
      console.error("Error loading more products:", err);
      setError(parseApiError(err, "Failed to load products"));
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    currentPage,
    hasMoreProducts,
    isLoadingMore,
    currentCategory,
    currentSize,
    currentGender,
    currentAge,
    currentSort,
    currentSortOrder,
    currentFeatured,
    currentSearch,
    pageSize,
  ]);

  // Persist product slugs so the product detail page can show prev/next navigation
  useEffect(() => {
    if (allProducts.length > 0) {
      try {
        const slugs = allProducts.map((p) => p.slug).filter(Boolean);
        sessionStorage.setItem("productListSlugs", JSON.stringify(slugs));
      } catch {
        // sessionStorage may be unavailable (private browsing, quota, etc.)
      }
    }
  }, [allProducts]);

  // Lock body scroll while initial products are loading; restore when done
  useEffect(() => {
    if (isLoading) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isLoading]);

  // Hide footer while more products can be loaded (visibility preserves layout)
  useEffect(() => {
    if (hasMoreProducts && !isLoading) {
      document.body.classList.add("hide-footer");
    } else {
      document.body.classList.remove("hide-footer");
    }
    return () => {
      document.body.classList.remove("hide-footer");
    };
  }, [hasMoreProducts, isLoading]);

  // Infinite scroll using IntersectionObserver
  // `isLoading` is in deps so the observer re-attaches after products load (sentinel enters DOM)
  useEffect(() => {
    if (!sentinelRef.current || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreProducts && !isLoadingMore) {
          loadMoreProducts();
        }
      },
      { rootMargin: "600px" }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMoreProducts, isLoadingMore, loadMoreProducts, isLoading]);

  // Restore scroll to the product that was clicked when returning from product detail
  useEffect(() => {
    if (isLoading || allProducts.length === 0) return;

    if (!haveReadScrollRestoreRef.current) {
      haveReadScrollRestoreRef.current = true;
      try {
        const s = sessionStorage.getItem("productsPageScrollToIndex");
        if (s != null) {
          const n = parseInt(s, 10);
          if (!isNaN(n) && n >= 0) scrollRestoreIndexRef.current = n;
        }
      } catch {
        // ignore
      }
    }

    const idx = scrollRestoreIndexRef.current;
    if (idx === null) return;

    if (idx < allProducts.length) {
      const el = document.querySelector(`[data-product-index="${idx}"]`);
      el?.scrollIntoView({ behavior: "auto", block: "center" });
      try {
        sessionStorage.removeItem("productsPageScrollToIndex");
      } catch {
        // ignore
      }
      scrollRestoreIndexRef.current = null;
      return;
    }

    if (hasMoreProducts && !isLoadingMore) {
      loadMoreProducts();
    }
  }, [isLoading, allProducts.length, hasMoreProducts, isLoadingMore, loadMoreProducts]);

  // Submit search — updates URL param which triggers server-side fetch
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || categoriesLoading || sizeOptionsLoading || genderOptionsLoading) return;
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = searchInput.trim();
    if (trimmed) {
      params.set("search", trimmed);
    } else {
      params.delete("search");
    }
    router.push(`/products?${params.toString()}`);
  };

  const handleClearSearch = () => {
    if (isLoading || categoriesLoading || sizeOptionsLoading || genderOptionsLoading) return;
    setSearchInput("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("search");
    router.push(`/products?${params.toString()}`);
    searchInputRef.current?.focus();
  };

  const handleSortChange = (sort: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (sort === "default") {
      params.delete("sortBy");
      params.delete("sortOrder");
    } else if (sort === "asc") {
      params.set("sortBy", "price");
      params.set("sortOrder", "asc");
    } else if (sort === "desc") {
      params.set("sortBy", "price");
      params.set("sortOrder", "desc");
    }

    router.push(`/products?${params.toString()}`);
  };

  const handleCategoryChange = (category: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (category === "all") {
      params.delete("category");
    } else {
      params.set("category", category);
    }

    router.push(`/products?${params.toString()}`);
  };

  const handleSizeChange = (size: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (size === "all") {
      params.delete("size");
    } else {
      params.set("size", size);
    }

    router.push(`/products?${params.toString()}`);
  };

  const handleGenderChange = (gender: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (gender === "all") {
      params.delete("gender");
    } else {
      params.set("gender", gender);
    }

    router.push(`/products?${params.toString()}`);
  };

  const handleClearFilters = () => {
    setSearchInput("");
    const params = new URLSearchParams();
    router.push(`/products?${params.toString()}`);
  };

  const handleViewChange = (view: "grid" | "list") => {
    const params = new URLSearchParams(searchParams.toString());
    if (view === "grid") params.delete("view");
    else params.set("view", view);
    router.push(`/products?${params.toString()}`);
  };

  const handleApplyFilters = useCallback(
    (filters: { category: string; size: string; gender: string; sort: string }) => {
      const params = new URLSearchParams(searchParams.toString());

      if (filters.category === "all") params.delete("category");
      else params.set("category", filters.category);

      if (filters.size === "all") params.delete("size");
      else params.set("size", filters.size);

      if (filters.gender === "all") params.delete("gender");
      else params.set("gender", filters.gender);

      if (filters.sort === "default") {
        params.delete("sortBy");
        params.delete("sortOrder");
      } else {
        params.set("sortBy", "price");
        params.set("sortOrder", filters.sort);
      }

      router.push(`/products?${params.toString()}`);
    },
    [router, searchParams],
  );

  // Check if any filters are applied
  const hasActiveFilters = useMemo(() => {
    return (
      currentCategory !== "all" ||
      currentSize !== "all" ||
      currentGender !== "all" ||
      currentAge !== "all" ||
      currentSort !== "default" ||
      currentFeatured ||
      currentSearch !== ""
    );
  }, [currentCategory, currentSize, currentGender, currentAge, currentSort, currentFeatured, currentSearch]);

  // Show product grid as soon as products API returns; don't block on categories/sizes/genders
  const isProductsLoading = isLoading;
  const isFiltersLoading = categoriesLoading || sizeOptionsLoading || genderOptionsLoading;

  /* ─── Shared mobile filter row (search + FilterSheet + reset) ─── */
  const mobileFilterRow = (
    <div className="flex items-center gap-2 lg:hidden">
      <ProductSearchInput
        value={searchInput}
        onChange={setSearchInput}
        onSubmit={handleSearchSubmit}
        onClear={handleClearSearch}
        inputRef={searchInputRef}
        disabled={isProductsLoading || isFiltersLoading}
        className="flex-1"
      />
      <FilterSheet
        categories={categories}
        sizeOptions={sizeOptions}
        genderOptions={genderOptions}
        currentCategory={currentCategory}
        currentSize={currentSize}
        currentGender={currentGender}
        currentSort={currentSort}
        currentSortOrder={currentSortOrder}
        onApplyFilters={handleApplyFilters}
        onClearFilters={handleClearFilters}
        disabled={isProductsLoading || isFiltersLoading}
      />
      {hasActiveFilters && !isProductsLoading && !isFiltersLoading && (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClearFilters}
          className="h-10 w-10 shrink-0 text-muted-foreground"
          aria-label="Clear all filters"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  if (isProductsLoading) {
    const skeletonCount = isMobile === null ? PAGE_SIZE_DESKTOP : isMobile ? PAGE_SIZE_MOBILE : PAGE_SIZE_DESKTOP;
    return (
      <>
        <div className="mb-6">{mobileFilterRow}</div>
        <div className={
          effectiveView === "list"
            ? "flex flex-col gap-4"
            : "grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-8"
        }>
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </>
    );
  }

  if (error || categoriesError) {
    const displayedError = error || categoriesError;
    return (
      <div className="text-center p-12">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
          <div className="text-red-600 mb-4">
            <svg
              className="mx-auto h-12 w-12"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-red-800 mb-2">
            Connection Error
          </h3>
          <p className="text-red-700 mb-4">{displayedError}</p>
          <Button
            onClick={() => {
              if (errorSource === 'categories') {
                fetchCategories();
              } else {
                window.location.reload();
              }
            }}
            variant="outline"
            disabled={errorSource === 'categories' ? categoriesLoading : isLoading}
          >
            {errorSource === 'categories' && categoriesLoading ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-pulse" />
                Retrying...
              </>
            ) : (
              "Try Again"
            )}
          </Button>
        </div>
      </div>
    );
  }

  if (!allProducts || allProducts.length === 0) {
    return (
      <>
        <div className="mb-6">{mobileFilterRow}</div>

        <div className="text-center py-16">
          <div className="max-w-md mx-auto">
            <div className="mb-6">
              <svg
                className="mx-auto h-24 w-24 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-medium text-gray-900 mb-3">
              {currentSearch ? "No products found" : "No products available"}
            </h3>
            <p className="text-gray-500 mb-6">
              {currentSearch || currentCategory !== "all" || currentSize !== "all" || currentGender !== "all" || currentFeatured
                ? "We couldn't find any products matching your current filters. Try adjusting your search criteria."
                : "Our product catalog is currently empty. Please check back later or contact us for more information."}
            </p>
            <div className="space-y-3">
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  onClick={handleClearFilters}
                  className="mr-3"
                >
                  Clear All Filters
                </Button>
              )}
              <Button asChild variant="default">
                <Link href="/">Back to Home</Link>
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Search + Filters */}
      <div className="mb-6 space-y-4">
        {/* Mobile: Search bar + Filter button + Reset in same row */}
        {mobileFilterRow}

        {/* Desktop Filters */}
        <div
          className="hidden lg:flex justify-end items-center gap-4"
          data-testid="desktop-filters"
        >
          {/* Desktop Search */}
          <ProductSearchInput
            value={searchInput}
            onChange={setSearchInput}
            onSubmit={handleSearchSubmit}
            onClear={handleClearSearch}
            className="flex-1 max-w-sm"
          />

          {/* Category Filter */}
          <Select value={currentCategory} onValueChange={handleCategoryChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.slug}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Size Filter */}
          <Select value={currentSize} onValueChange={handleSizeChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filter by size" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sizes</SelectItem>
              {sizeOptions.map((size) => (
                <SelectItem key={size.id} value={size.name}>
                  {size.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Gender Filter */}
          <Select value={currentGender} onValueChange={handleGenderChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Gender" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Genders</SelectItem>
              {genderOptions.map((g) => (
                <SelectItem key={g.id} value={g.name}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sort By */}
          <Select
            value={currentSort === "price" ? currentSortOrder : "default"}
            onValueChange={handleSortChange}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="asc">Price: Low to High</SelectItem>
              <SelectItem value="desc">Price: High to Low</SelectItem>
            </SelectContent>
          </Select>

          {/* Clear All Filters Button */}
          {hasActiveFilters && (
            <Button
              variant="outline"
              onClick={handleClearFilters}
              className="whitespace-nowrap text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* View toggle: mobile only — above products when we have results */}
      {allProducts.length > 0 && isMobile === true && (
        <div className="flex justify-end mb-3">
          <div className="flex items-center border rounded-md p-0.5">
            <Button
              variant={effectiveView === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => handleViewChange("grid")}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={effectiveView === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => handleViewChange("list")}
              aria-label="List view"
            >
              <LayoutList className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Active search chip */}
      {currentSearch && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Results for</span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
            &ldquo;{currentSearch}&rdquo;
            <button onClick={handleClearSearch} className="hover:text-primary/70 ml-0.5">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      )}

      {/* Products — grid (default) or list view */}
      {allProducts.length > 0 ? (
        <>
          <div
            className={
              effectiveView === "list"
                ? "flex flex-col gap-4 mb-8"
                : "grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-8 mb-8"
            }
          >
            {allProducts.map((product, index) => (
              <div
                key={product.id}
                data-product-index={index}
                className={effectiveView === "list" ? "w-full max-w-full" : undefined}
              >
                <ProductCard product={product} index={index} currentView={effectiveView} />
              </div>
            ))}
          </div>

          {/* Infinite Scroll Sentinel */}
          <div ref={sentinelRef} data-testid="infinite-scroll-sentinel" className="py-4">
            {hasMoreProducts && (
              <div
                className={
                  effectiveView === "list"
                    ? "flex flex-col gap-4"
                    : "grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-8"
                }
              >
                {Array.from({ length: isMobile ? PAGE_SIZE_MOBILE : PAGE_SIZE_DESKTOP }).map((_, i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-16">
          <div className="max-w-md mx-auto">
            <div className="mb-6">
              <svg
                className="mx-auto h-24 w-24 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M9 5l7 7-7 7"
                />
              </svg>
            </div>
            <h3 className="text-xl font-medium text-gray-900 mb-3">
              No products found
            </h3>
            <p className="text-gray-500 mb-6">
              We couldn&apos;t find any products matching your current filters. Try adjusting your search criteria.
            </p>
            <div className="space-y-3">
              <Button
                variant="outline"
                onClick={handleClearFilters}
                className="mr-3"
              >
                Clear All Filters
              </Button>
              <Button asChild variant="default">
                <Link href="/">Back to Home</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
