"use client";

import { useEffect, useState, useMemo } from "react";
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
import Pagination from "@/components/ui/pagination";
import FilterSheet from "@/components/FilterSheet";
import { usePreloadedData } from "@/components/data-preloader";
import { getProducts, ProductsResponse, Product } from "@/lib/services/api";

export default function ProductsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    categories,
    isLoading: categoriesLoading,
    error: categoriesError,
  } = usePreloadedData();

  const [productsData, setProductsData] = useState<ProductsResponse>({
    products: [],
    pagination: {
      currentPage: 1,
      totalPages: 0,
      totalItems: 0,
      itemsPerPage: 12,
      hasNextPage: false,
      hasPrevPage: false,
    },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get current URL parameters
  const currentPage = parseInt(searchParams.get("page") || "1");
  const currentSort = searchParams.get("sortBy") || "default";
  const currentSortOrder = searchParams.get("sortOrder") || "desc";
  const currentCategory = searchParams.get("category") || "all";
  const currentSearch = searchParams.get("search") || "";
  const currentBestseller = searchParams.get("bestseller") === "true";

  // Load products with server-side filtering, sorting, and pagination
  useEffect(() => {
    const loadProducts = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await getProducts({
          limit: 12,
          page: currentPage,
          category: currentCategory !== "all" ? currentCategory : undefined,
          sortBy: currentSort !== "default" ? currentSort : undefined,
          sortOrder: currentSortOrder,
          featured: currentBestseller || undefined,
        });

        setProductsData(response);
      } catch (err) {
        console.error("Error loading products:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load products"
        );
        setProductsData({
          products: [],
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalItems: 0,
            itemsPerPage: 12,
            hasNextPage: false,
            hasPrevPage: false,
          },
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadProducts();
  }, [
    currentPage,
    currentSort,
    currentSortOrder,
    currentCategory,
    currentBestseller,
  ]);

  // Client-side search filtering (search happens on frontend with autocomplete)
  const filteredProducts = useMemo(() => {
    if (!currentSearch) {
      return productsData.products;
    }

    const searchLower = currentSearch.toLowerCase();
    return productsData.products.filter(
      (product) =>
        product.name.toLowerCase().includes(searchLower) ||
        (product.description &&
          product.description.toLowerCase().includes(searchLower))
    );
  }, [productsData.products, currentSearch]);

  const handleSortChange = (sort: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page"); // Reset to page 1 when sorting changes

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
    params.delete("page"); // Reset to page 1 when category changes

    if (category === "all") {
      params.delete("category");
    } else {
      params.set("category", category);
    }

    router.push(`/products?${params.toString()}`);
  };

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", page.toString());
    router.push(`/products?${params.toString()}`);
  };

  const handleBestsellerToggle = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page"); // Reset to page 1 when toggling bestsellers

    if (currentBestseller) {
      params.delete("bestseller");
    } else {
      params.set("bestseller", "true");
    }

    router.push(`/products?${params.toString()}`);
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

  if (!productsData.products || productsData.products.length === 0) {
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

        {/* Desktop Filters */}
        <div className="hidden md:flex flex-col sm:flex-row sm:items-center gap-4">
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

          {/* Sort Filter */}
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
        Showing {filteredProducts.length} of{" "}
        {productsData.pagination.totalItems} products
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8 mb-8">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          {/* Pagination */}
          <Pagination
            currentPage={productsData.pagination.currentPage}
            totalPages={productsData.pagination.totalPages}
            onPageChange={handlePageChange}
            className="mt-8"
          />
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
