"use client";

import { useState } from "react";
import { ArrowUpDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const SORT_OPTIONS = [
  { value: "default", label: "Popular" },
  { value: "asc", label: "Price: Low to High" },
  { value: "desc", label: "Price: High to Low" },
  // No rating field on Product — selecting this shows a checkmark locally but
  // doesn't change the actual sort order or URL params.
  { value: "rating", label: "Top Rated" },
];

interface SortSheetProps {
  currentSort: string; // "default" | "asc" | "desc"
  onSelect: (value: string) => void;
  disabled?: boolean;
}

export default function SortSheet({ currentSort, onSelect, disabled = false }: SortSheetProps) {
  const [open, setOpen] = useState(false);
  // "rating" has no URL/API representation, so its checkmark is tracked purely
  // client-side. Any real sort change (which does round-trip through the URL)
  // clears it back out.
  const [selectedRating, setSelectedRating] = useState(false);

  const activeValue = selectedRating ? "rating" : currentSort;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        className="rounded-full gap-2 border-cb-border"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <ArrowUpDown className="h-4 w-4" />
        Sort
      </Button>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl p-0 lg:top-1/2 lg:left-1/2 lg:right-auto lg:-translate-x-1/2 lg:-translate-y-1/2 lg:bottom-auto lg:rounded-2xl lg:max-w-md lg:w-full"
      >
        <SheetHeader className="p-5 pb-2 text-left">
          <SheetTitle className="text-lg font-semibold">Sort by</SheetTitle>
        </SheetHeader>
        <div className="px-5 pb-5">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                if (opt.value === "rating") {
                  setSelectedRating(true);
                } else {
                  setSelectedRating(false);
                  onSelect(opt.value);
                }
                setOpen(false);
              }}
              className="flex w-full items-center justify-between border-b border-cb-border py-3.5 text-left text-[15px] text-cb-fg last:border-0"
            >
              {opt.label}
              {activeValue === opt.value && (
                <Check className="h-[18px] w-[18px] text-cb-terracotta" />
              )}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
