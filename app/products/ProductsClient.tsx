"use client";

import { useMemo } from "react";
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

export default function ProductsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { products: allProducts, categories, isLoading, error } = usePreloadedData();

  // Get current URL parameters
  const currentPage = parseInt(searchParams.get("page") || "1");
  const currentSort = searchParams.get("sortBy") || "default";
  const currentSortOrder = searchParams.get("sortOrder") || "desc";
  const currentCategory = searchParams.get("category") || "all";
  const currentSearch = searchParams.get("search") || "";
  const currentBestseller = searchParams.get("bestseller") === "true";

  // Client-side filtering, sorting, and pagination
  const { filteredProducts, pagination } = useMemo(() => {
    let filtered = [...allProducts];

    // Filter by category
    if (currentCategory !== "all") {
      const category = categories.find((cat) => cat.slug === currentCategory);
      if (category) {
        filtered = filtered.filter(
          (product) => product.categoryId === category.id
        );
      }
    }

    // Filter by search
    if (currentSearch) {
      const searchLower = currentSearch.toLowerCase();
      filtered = filtered.filter(
        (product) =>
          product.name.toLowerCase().includes(searchLower) ||
          (product.description &&
            product.description.toLowerCase().includes(searchLower))
      );
    }

    // Filter by bestseller
    if (currentBestseller) {
      filtered = filtered.filter((product) => product.is_featured);
    }

    // Sort products
    if (currentSort === "price") {
      filtered.sort((a, b) => {
        if (currentSortOrder === "asc") {
          return a.price - b.price;
        } else {
          return b.price - a.price;
        }
      });
    } else if (currentSort === "name") {
      filtered.sort((a, b) => {
        if (currentSortOrder === "asc") {
          return a.name.localeCompare(b.name);
        } else {
          return b.name.localeCompare(a.name);
        }
      });
    }
    // Default sorting (by creation date or original order)
    else if (currentSort === "default") {
      // Keep original order or sort by creation date if available
      // filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    // Pagination
    const itemsPerPage = 12;
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedProducts = filtered.slice(startIndex, endIndex);

    return {
      filteredProducts: paginatedProducts,
      pagination: {
        currentPage,
        totalPages,
        totalItems,
        itemsPerPage,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
      },
    };
  }, [
    allProducts,
    categories,
    currentCategory,
    currentSearch,
    currentBestseller,
    currentSort,
    currentSortOrder,
    currentPage,
  ]);

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

  if (isLoading) {
    return (
      <div className="text-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-lg">Loading products...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-12">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
          <div className="text-red-600 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-red-800 mb-2">Connection Error</h3>
          <p className="text-red-700 mb-4">{error}</p>
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
            Our product catalog is currently empty. Please check back later or contact us for more information.
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
        </div>
      </div>

      {/* Results Info */}
      <div className="mb-6 text-sm text-gray-600">
        Showing {filteredProducts.length} of {pagination.totalItems} products
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          {/* Pagination */}
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
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
              {(currentSearch || currentCategory !== "all" || currentBestseller) && (
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
