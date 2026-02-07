"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
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
import { usePreloadedData } from "@/components/data-preloader";
import { getProducts, ProductsResponse, Product } from "@/lib/services/api";
import { ChevronUp, Loader2 } from "lucide-react";

export default function ProductsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    categories,
    isLoading: categoriesLoading,
    error: categoriesError,
  } = usePreloadedData();

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalItems, setTotalItems] = useState(0);

  // Get current URL parameters
  const currentSort = searchParams.get("sortBy") || "default";
  const currentSortOrder = searchParams.get("sortOrder") || "desc";
  const currentCategory = searchParams.get("category") || "all";
  const currentSearch = searchParams.get("search") || "";
  const currentBestseller = searchParams.get("bestseller") === "true";

  // Load products with server-side filtering, sorting
  useEffect(() => {
    const loadProducts = async () => {
      try {
        setIsLoading(true);
        setError(null);
        setCurrentPage(1);
        setAllProducts([]);

        const response = await getProducts({
          limit: 12,
          page: 1,
          category: currentCategory !== "all" ? currentCategory : undefined,
          sortBy: currentSort !== "default" ? currentSort : undefined,
          sortOrder: currentSortOrder,
          featured: currentBestseller || undefined,
        });

        // Ensure no duplicate products from the initial load
        const uniqueProducts = response.products.filter(
          (product, index, self) =>
            index === self.findIndex((p) => p.id === product.id)
        );
        setAllProducts(uniqueProducts);
        setTotalItems(response.pagination.totalItems);
        setHasMoreProducts(response.pagination.hasNextPage);
      } catch (err) {
        console.error("Error loading products:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load products"
        );
        setAllProducts([]);
        setTotalItems(0);
        setHasMoreProducts(false);
      } finally {
        setIsLoading(false);
      }
    };

    loadProducts();
  }, [currentSort, currentSortOrder, currentCategory, currentBestseller]);

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
    if (isLoadingMore || !hasMoreProducts) return;

    try {
      setIsLoadingMore(true);
      const nextPage = currentPage + 1;

      const response = await getProducts({
        limit: 12,
        page: nextPage,
        category: currentCategory !== "all" ? currentCategory : undefined,
        sortBy: currentSort !== "default" ? currentSort : undefined,
        sortOrder: currentSortOrder,
        featured: currentBestseller || undefined,
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
    currentSort,
    currentSortOrder,
    currentBestseller,
  ]);

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

  const handleBestsellerToggle = () => {
    const params = new URLSearchParams(searchParams.toString());

    if (currentBestseller) {
      params.delete("bestseller");
    } else {
      params.set("bestseller", "true");
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
      currentSort !== "default" ||
      currentBestseller ||
      currentSearch !== ""
    );
  }, [currentCategory, currentSort, currentBestseller, currentSearch]);

  if (isLoading || categoriesLoading) {
    return (
      <div className="text-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-lg">Loading products...</p>
      </div>
    );
  }

  if (error || categoriesError) {
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
          <p className="text-red-700 mb-4">{error || categoriesError}</p>
          <Button onClick={() => window.location.reload()} variant="outline">
            Try Again
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
              currentCategory={currentCategory}
              currentSort={currentSort}
              currentSortOrder={currentSortOrder}
              currentBestseller={currentBestseller}
              onCategoryChange={handleCategoryChange}
              onSortChange={handleSortChange}
              onBestsellerToggle={handleBestsellerToggle}
              onClearFilters={handleClearFilters}
            />
          </div>
        </div>

        {/* Desktop Filters - Moved to end */}
        <div className="hidden md:flex justify-end items-center gap-4">
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

          {/* Sort Toggle Button */}
          <Button
            variant="outline"
            onClick={() => {
              if (currentSort === "default") {
                handleSortChange("asc");
              } else if (
                currentSort === "price" &&
                currentSortOrder === "asc"
              ) {
                handleSortChange("desc");
              } else {
                handleSortChange("default");
              }
            }}
            className="w-[200px] justify-between"
          >
            <span>
              {currentSort === "default"
                ? "Sort"
                : currentSortOrder === "asc"
                ? "Price: Low to High"
                : "Price: High to Low"}
            </span>
            <div className="flex flex-col">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                  clipRule="evenodd"
                />
              </svg>
              <svg
                className="w-3 h-3 -mt-1"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </Button>

          {/* Bestsellers Toggle */}
          <Button
            variant={currentBestseller ? "default" : "outline"}
            onClick={handleBestsellerToggle}
            className="whitespace-nowrap"
          >
            {currentBestseller ? "✓ Bestsellers" : "Show Bestsellers"}
          </Button>

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
        {currentBestseller && " (Bestsellers only)"}
      </div>

      {/* Products Grid or No Results Message */}
      {filteredProducts.length > 0 ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-8 mb-8">
            {filteredProducts.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </div>

          {/* Show More Button */}
          <div className="flex flex-col items-center space-y-4 mt-8">
            {hasMoreProducts && !currentSearch && (
              <Button
                onClick={loadMoreProducts}
                disabled={isLoadingMore}
                variant="outline"
                size="lg"
                className="px-8"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Show More"
                )}
              </Button>
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
              {currentSearch || currentCategory !== "all" || currentBestseller
                ? "We couldn't find any products matching your current filters. Try adjusting your search criteria."
                : "No products are currently available. Please check back later."}
            </p>
            <div className="space-y-3">
              {(currentSearch ||
                currentCategory !== "all" ||
                currentBestseller) && (
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
