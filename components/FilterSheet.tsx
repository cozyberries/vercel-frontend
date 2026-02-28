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

interface SizeOption {
  id: string;
  name: string;
  display_order: number;
}

interface GenderOption {
  id: string;
  name: string;
  display_order: number;
}

interface FilterSheetProps {
  categories: Category[];
  sizeOptions: SizeOption[];
  genderOptions: GenderOption[];
  currentCategory: string;
  currentSize: string;
  currentGender: string;
  currentSort: string;
  currentSortOrder: string;
  currentFeatured: boolean;
  onCategoryChange: (category: string) => void;
  onSizeChange: (size: string) => void;
  onGenderChange: (gender: string) => void;
  onSortChange: (sort: string) => void;
  onFeaturedToggle: () => void;
  onClearFilters: () => void;
}

export default function FilterSheet({
  categories,
  sizeOptions,
  genderOptions,
  currentCategory,
  currentSize,
  currentGender,
  currentSort,
  currentSortOrder,
  currentFeatured,
  onCategoryChange,
  onSizeChange,
  onGenderChange,
  onSortChange,
  onFeaturedToggle,
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
      <SheetContent side="left" className="w-[min(90vw,400px)] p-0">
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

            {/* Size Filter */}
            <div>
              <h3 className="text-sm font-medium mb-3">Size</h3>
              <Select value={currentSize} onValueChange={onSizeChange}>
                <SelectTrigger className="w-full">
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
            </div>

            {/* Gender Filter */}
            <div>
              <h3 className="text-sm font-medium mb-3">Gender</h3>
              <Select value={currentGender} onValueChange={onGenderChange}>
                <SelectTrigger className="w-full">
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
                {currentSize !== "all" && (
                  <div className="flex items-center justify-between text-sm">
                    <span>Size:</span>
                    <span className="font-medium">{currentSize}</span>
                  </div>
                )}
                {currentGender !== "all" && (
                  <div className="flex items-center justify-between text-sm">
                    <span>Gender:</span>
                    <span className="font-medium">{currentGender}</span>
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
                {currentFeatured && (
                  <div className="flex items-center justify-between text-sm">
                    <span>Filter:</span>
                    <span className="font-medium">Featured Only</span>
                  </div>
                )}
                {currentCategory === "all" && currentSize === "all" && currentGender === "all" && currentSort === "default" && !currentFeatured && (
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
            {(currentCategory !== "all" || currentSize !== "all" || currentGender !== "all" || currentSort !== "default" || currentFeatured) && (
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
