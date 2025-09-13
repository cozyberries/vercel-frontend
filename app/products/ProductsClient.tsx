"use client";

import { useState, useEffect, useMemo } from "react";
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
import {
  SimplifiedProduct,
  getAllProducts,
  getCategories,
} from "@/lib/services/api";
import ProductCard from "@/components/product-card";
import Pagination from "@/components/ui/pagination";

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export default function ProductsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [allProducts, setAllProducts] = useState<SimplifiedProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Get current URL parameters
  const currentPage = parseInt(searchParams.get("page") || "1");
  const currentSort = searchParams.get("sortBy") || "default";
  const currentSortOrder = searchParams.get("sortOrder") || "desc";
  const currentCategory = searchParams.get("category") || "all";
  const currentSearch = searchParams.get("search") || "";
  const currentBestseller = searchParams.get("bestseller") === "true";

  // Fetch all products and categories on component mount
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [productsData, categoriesData] = await Promise.all([
          getAllProducts(),
          getCategories(),
        ]);
        setAllProducts(productsData);
        setCategories(categoriesData);
      } catch (error) {
        console.error("Error fetching data:", error);
        setAllProducts([]);
        setCategories([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

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

  if (isLoading) {
    return (
      <div className="text-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-lg">Loading products...</p>
      </div>
    );
  }

  if (!allProducts || allProducts.length === 0) {
    return (
      <div className="text-center p-12">
        <p className="text-lg mb-4">No products available.</p>
        <Button asChild>
          <Link href="/">Go Home</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* Filters and Search */}
      <div className="mb-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
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

      {/* Products Grid */}
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
  );
}
