"use client";

import { useState } from "react";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

interface FilterSheetProps {
  categories: Category[];
  currentCategory: string;
  currentSort: string;
  currentSortOrder: string;
  currentBestseller: boolean;
  onCategoryChange: (category: string) => void;
  onSortChange: (sort: string) => void;
  onBestsellerToggle: () => void;
  onClearFilters: () => void;
}

export default function FilterSheet({
  categories,
  currentCategory,
  currentSort,
  currentSortOrder,
  currentBestseller,
  onCategoryChange,
  onSortChange,
  onBestsellerToggle,
  onClearFilters,
}: FilterSheetProps) {
  const [open, setOpen] = useState(false);

  const handleApplyFilters = () => {
    setOpen(false);
  };

  const handleClearFilters = () => {
    onClearFilters();
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2 md:hidden">
          <Filter className="h-4 w-4" />
          Filters
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[350px] sm:w-[400px] p-0">
        <div className="flex h-full flex-col">
          <SheetHeader className="p-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Category Filter */}
            <div>
              <h3 className="text-sm font-medium mb-3">Category</h3>
              <Select value={currentCategory} onValueChange={onCategoryChange}>
                <SelectTrigger className="w-full">
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
            </div>

            {/* Sort Filter */}
            <div>
              <h3 className="text-sm font-medium mb-3">Sort By</h3>
              <Select
                value={currentSort === "price" ? currentSortOrder : "default"}
                onValueChange={onSortChange}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="asc">Price: Low to High</SelectItem>
                  <SelectItem value="desc">Price: High to Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Bestsellers Toggle */}
            <div>
              <h3 className="text-sm font-medium mb-3">Special Offers</h3>
              <Button
                variant={currentBestseller ? "default" : "outline"}
                onClick={onBestsellerToggle}
                className="w-full justify-start"
              >
                {currentBestseller ? "✓ Bestsellers" : "Show Bestsellers"}
              </Button>
            </div>

            {/* Active Filters Summary */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium mb-3">Active Filters</h3>
              <div className="space-y-2">
                {currentCategory !== "all" && (
                  <div className="flex items-center justify-between text-sm">
                    <span>Category:</span>
                    <span className="font-medium">
                      {categories.find((c) => c.slug === currentCategory)?.name ||
                        currentCategory}
                    </span>
                  </div>
                )}
                {currentSort !== "default" && (
                  <div className="flex items-center justify-between text-sm">
                    <span>Sort:</span>
                    <span className="font-medium">
                      {currentSort === "price"
                        ? `Price ${currentSortOrder === "asc" ? "Low to High" : "High to Low"}`
                        : "Default"}
                    </span>
                  </div>
                )}
                {currentBestseller && (
                  <div className="flex items-center justify-between text-sm">
                    <span>Filter:</span>
                    <span className="font-medium">Bestsellers Only</span>
                  </div>
                )}
                {currentCategory === "all" && currentSort === "default" && !currentBestseller && (
                  <p className="text-sm text-muted-foreground">No filters applied</p>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="border-t p-4 space-y-3">
            <Button onClick={handleApplyFilters} className="w-full">
              Apply Filters
            </Button>
            {(currentCategory !== "all" || currentSort !== "default" || currentBestseller) && (
              <Button
                variant="outline"
                onClick={handleClearFilters}
                className="w-full"
              >
                Clear All Filters
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
