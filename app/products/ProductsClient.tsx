"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ProductCard from "@/components/product-card";
import FilterSheet from "@/components/FilterSheet";
import { getProducts, getCategoryOptions, getSizeOptions, getGenderOptions, CategoryOption, SizeOptionFilter, GenderOptionFilter, Product } from "@/lib/services/api";
import { ChevronUp, Loader2 } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";

const PAGE_SIZE_MOBILE = 4;
const PAGE_SIZE_DESKTOP = 12;

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

  // Infinite scroll sentinel ref
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Get current URL parameters
  const currentSort = searchParams.get("sortBy") || "default";
  const currentSortOrder = searchParams.get("sortOrder") || "desc";
  const currentCategory = searchParams.get("category") || "all";
  const currentSize = searchParams.get("size") || "all";
  const currentGender = searchParams.get("gender") || "all";
  const currentAge = searchParams.get("age") || "all";
  const currentSearch = searchParams.get("search") || "";
  const currentFeatured = searchParams.get("featured") === "true";

  // Scroll to top when landing on products page or when any filter/category/age changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [searchParams.toString()]);

  // Load products with server-side filtering, sorting
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
        const apiError = err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { error?: string; details?: string } } }).response?.data
          : null;
        const errorMessage = apiError?.error
          ? (apiError.details ? `${apiError.error}: ${apiError.details}` : apiError.error)
          : (err instanceof Error ? err.message : "Failed to load products");
        setError(errorMessage);
        setErrorSource('products');
        setAllProducts([]);
        setTotalItems(0);
        setHasMoreProducts(false);
      } finally {
        setIsLoading(false);
      }
    };

    loadProducts();
  }, [currentSort, currentSortOrder, currentCategory, currentSize, currentGender, currentAge, currentFeatured, pageSize]);

  // Client-side search filtering (search happens on frontend with autocomplete)
  const filteredProducts = useMemo(() => {
    if (!currentSearch) {
      return allProducts;
    }

    const searchLower = currentSearch.toLowerCase();
    return allProducts.filter(
      (product) =>
        product.name.toLowerCase().includes(searchLower) ||
        (product.description &&
          product.description.toLowerCase().includes(searchLower))
    );
  }, [allProducts, currentSearch]);

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
    } catch (err) {
      console.error("Error loading more products:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load more products"
      );
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
    pageSize,
  ]);

  // Infinite scroll using IntersectionObserver
  // `isLoading` is in deps so the observer re-attaches after products load (sentinel enters DOM)
  useEffect(() => {
    if (!sentinelRef.current || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreProducts && !isLoadingMore && !currentSearch) {
          loadMoreProducts();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMoreProducts, isLoadingMore, currentSearch, loadMoreProducts, isLoading]);

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

  const handleFeaturedToggle = () => {
    const params = new URLSearchParams(searchParams.toString());

    if (currentFeatured) {
      params.delete("featured");
    } else {
      params.set("featured", "true");
    }

    router.push(`/products?${params.toString()}`);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleClearFilters = () => {
    const params = new URLSearchParams();
    router.push(`/products?${params.toString()}`);
  };

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

  if (isLoading || categoriesLoading || sizeOptionsLoading || genderOptionsLoading) {
    return (
      <div className="text-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-lg">Loading products...</p>
      </div>
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
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
            No products available
          </h3>
          <p className="text-gray-500 mb-6">
            Our product catalog is currently empty. Please check back later or
            contact us for more information.
          </p>
          <div className="space-y-3">
            <Button asChild variant="default">
              <Link href="/">Back to Home</Link>
            </Button>
            <div>
              <Button asChild variant="outline">
                <Link href="/contact">Contact Us</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Filters and Search */}
      <div className="mb-8 space-y-4">
        {/* Mobile Filter Button */}
        <div className="flex justify-between items-center md:hidden">
          <h2 className="text-lg font-medium">Products</h2>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearFilters}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                Clear All
              </Button>
            )}
            <FilterSheet
              categories={categories}
              sizeOptions={sizeOptions}
              genderOptions={genderOptions}
              currentCategory={currentCategory}
              currentSize={currentSize}
              currentGender={currentGender}
              currentSort={currentSort}
              currentSortOrder={currentSortOrder}
              currentFeatured={currentFeatured}
              onCategoryChange={handleCategoryChange}
              onSizeChange={handleSizeChange}
              onGenderChange={handleGenderChange}
              onSortChange={handleSortChange}
              onFeaturedToggle={handleFeaturedToggle}
              onClearFilters={handleClearFilters}
            />
          </div>
        </div>

        {/* Desktop Filters - Moved to end */}
        <div
          className="hidden md:flex justify-end items-center gap-4"
          data-testid="desktop-filters"
        >
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

          {/* Sort By - same as mobile FilterSheet */}
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

          {/* Featured Toggle - same label as mobile (Special Offers) */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">
              Special Offers
            </span>
            <Button
              variant={currentFeatured ? "default" : "outline"}
              onClick={handleFeaturedToggle}
              className="whitespace-nowrap"
            >
              {currentFeatured ? "✓ Featured" : "Show Featured"}
            </Button>
          </div>

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

      {/* Results Info */}
      <div className="mb-6 text-sm text-gray-600">
        Showing {filteredProducts.length} of {totalItems} products
        {currentSearch && ` for "${currentSearch}"`}
        {currentCategory !== "all" &&
          ` in ${
            categories.find((c) => c.slug === currentCategory)?.name ||
            currentCategory
          }`}
        {currentSize !== "all" && ` · Size: ${currentSize}`}
        {currentGender !== "all" && ` · ${currentGender}`}
        {currentFeatured && " (Featured only)"}
      </div>

      {/* Products Grid or No Results Message */}
      {filteredProducts.length > 0 ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-8 mb-8">
            {filteredProducts.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </div>

          {/* Infinite Scroll Sentinel */}
          <div ref={sentinelRef} data-testid="infinite-scroll-sentinel" className="flex justify-center py-8">
            {isLoadingMore && (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Loading more products...</span>
              </div>
            )}
            {!hasMoreProducts && allProducts.length > 0 && !currentSearch && (
              <p className="text-sm text-gray-400">You&apos;ve seen all products</p>
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
              {currentSearch || currentCategory !== "all" || currentSize !== "all" || currentGender !== "all" || currentFeatured
                ? "We couldn't find any products matching your current filters. Try adjusting your search criteria."
                : "No products are currently available. Please check back later."}
            </p>
            <div className="space-y-3">
              {(currentSearch ||
                currentCategory !== "all" ||
                currentSize !== "all" ||
                currentGender !== "all" ||
                currentFeatured) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const params = new URLSearchParams();
                    router.push(`/products?${params.toString()}`);
                  }}
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
      )}
    </>
  );
}
