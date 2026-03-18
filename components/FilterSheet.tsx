"use client";

import { useState } from "react";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useSwipeToClose } from "@/hooks/useSwipeToClose";
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

interface FilterValues {
  category: string;
  size: string;
  gender: string;
  sort: string;
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
  onApplyFilters: (filters: FilterValues) => void;
  onClearFilters: () => void;
  disabled?: boolean;
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
  onApplyFilters,
  onClearFilters,
  disabled = false,
}: FilterSheetProps) {
  const [open, setOpen] = useState(false);

  // Local pending state — only sent to parent on "Apply"
  const [pendingCategory, setPendingCategory] = useState(currentCategory);
  const [pendingSize, setPendingSize] = useState(currentSize);
  const [pendingGender, setPendingGender] = useState(currentGender);
  const [pendingSort, setPendingSort] = useState(
    currentSort === "price" ? currentSortOrder : "default"
  );

  // Reset local state when sheet opens (sync with actual URL params)
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setPendingCategory(currentCategory);
      setPendingSize(currentSize);
      setPendingGender(currentGender);
      setPendingSort(currentSort === "price" ? currentSortOrder : "default");
    }
    setOpen(isOpen);
  };

  const swipeLeftToClose = useSwipeToClose("left", () => setOpen(false));

  const handleApplyFilters = () => {
    onApplyFilters({
      category: pendingCategory,
      size: pendingSize,
      gender: pendingGender,
      sort: pendingSort,
    });
    setOpen(false);
  };

  const handleClearFilters = () => {
    onClearFilters();
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2 md:hidden" disabled={disabled}>
          <Filter className="h-4 w-4" />
          Filters
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(90vw,400px)] p-0">
        <div
          className="flex h-full flex-col touch-pan-y"
          {...swipeLeftToClose}
        >
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
              <Select value={pendingCategory} onValueChange={setPendingCategory}>
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
              <Select value={pendingSize} onValueChange={setPendingSize}>
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
              <Select value={pendingGender} onValueChange={setPendingGender}>
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
                value={pendingSort}
                onValueChange={setPendingSort}
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

            {/* Selected Filters Summary */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium mb-3">Selected Filters</h3>
              <div className="space-y-2">
                {pendingCategory !== "all" && (
                  <div className="flex items-center justify-between text-sm">
                    <span>Category:</span>
                    <span className="font-medium">
                      {categories.find((c) => c.slug === pendingCategory)?.name ||
                        pendingCategory}
                    </span>
                  </div>
                )}
                {pendingSize !== "all" && (
                  <div className="flex items-center justify-between text-sm">
                    <span>Size:</span>
                    <span className="font-medium">{pendingSize}</span>
                  </div>
                )}
                {pendingGender !== "all" && (
                  <div className="flex items-center justify-between text-sm">
                    <span>Gender:</span>
                    <span className="font-medium">{pendingGender}</span>
                  </div>
                )}
                {pendingSort !== "default" && (
                  <div className="flex items-center justify-between text-sm">
                    <span>Sort:</span>
                    <span className="font-medium">
                      {pendingSort === "asc" ? "Price Low to High" : "Price High to Low"}
                    </span>
                  </div>
                )}
                {pendingCategory === "all" && pendingSize === "all" && pendingGender === "all" && pendingSort === "default" && (
                  <p className="text-sm text-muted-foreground">No filters selected</p>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="border-t p-4 space-y-3">
            <Button onClick={handleApplyFilters} className="w-full">
              Apply Filters
            </Button>
            {(pendingCategory !== "all" || pendingSize !== "all" || pendingGender !== "all" || pendingSort !== "default") && (
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
