"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
interface Option {
  id: string;
  name: string;
  display_order: number;
}

interface AgeOption extends Option {
  slug: string;
}

interface FilterValues {
  size: string;
  gender: string;
  age: string;
  design: string | null;
}

interface FilterSheetProps {
  sizeOptions: Option[];
  genderOptions: Option[];
  ageOptions: AgeOption[];
  currentSize: string;
  currentGender: string;
  currentAge: string;
  currentDesign: string | null;
  itemCount: number;
  onApplyFilters: (filters: FilterValues) => void;
  onClearFilters: () => void;
  disabled?: boolean;
}

// No backend field for pattern/design — chips are UI-only and don't affect results.
const PATTERN_OPTIONS = ["Solid", "Stripe", "Polka", "Floral", "Check"];

const MIN_PRICE = 250;
const MAX_PRICE = 2000;

export default function FilterSheet({
  sizeOptions,
  genderOptions,
  ageOptions,
  currentSize,
  currentGender,
  currentAge,
  currentDesign,
  itemCount,
  onApplyFilters,
  onClearFilters,
  disabled = false,
}: FilterSheetProps) {
  const [open, setOpen] = useState(false);

  // Local pending state — only sent to parent on "Show N items"
  const [pendingSize, setPendingSize] = useState(currentSize);
  const [pendingGender, setPendingGender] = useState(currentGender);
  const [pendingAge, setPendingAge] = useState(currentAge);
  const [pendingPattern, setPendingPattern] = useState<string | null>(currentDesign);
  const [pendingMaxPrice, setPendingMaxPrice] = useState(MAX_PRICE);

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setPendingSize(currentSize);
      setPendingGender(currentGender);
      setPendingAge(currentAge);
      setPendingPattern(currentDesign);
      setPendingMaxPrice(MAX_PRICE);
    }
    setOpen(isOpen);
  };

  const handleApplyFilters = () => {
    onApplyFilters({ size: pendingSize, gender: pendingGender, age: pendingAge, design: pendingPattern });
    setOpen(false);
  };

  const handleClearFilters = () => {
    setPendingPattern(null);
    setPendingMaxPrice(MAX_PRICE);
    onClearFilters();
    setOpen(false);
  };

  const hasPending =
    pendingSize !== "all" ||
    pendingGender !== "all" ||
    pendingAge !== "all" ||
    pendingPattern !== null ||
    pendingMaxPrice !== MAX_PRICE;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <Button
        variant="outline"
        className="flex items-center gap-2 rounded-full border-cb-border"
        disabled={disabled}
        onClick={() => handleOpenChange(true)}
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filters
      </Button>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl p-0 max-h-[88vh] flex flex-col lg:top-1/2 lg:left-1/2 lg:right-auto lg:-translate-x-1/2 lg:-translate-y-1/2 lg:bottom-auto lg:rounded-2xl lg:max-w-md lg:w-full lg:h-auto"
      >
        <div className="flex h-full min-h-0 flex-col">
          <SheetHeader className="p-5 pb-2 text-left">
            <SheetTitle className="text-lg font-semibold">Filters</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Gender */}
            <div>
              <h3 className="text-sm font-bold mb-3">Gender</h3>
              <div className="flex flex-wrap gap-2">
                {genderOptions.map((g) => (
                  <Chip
                    key={g.id}
                    active={pendingGender === g.id}
                    onClick={() => setPendingGender(pendingGender === g.id ? "all" : g.id)}
                  >
                    {g.name}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Age */}
            <div>
              <h3 className="text-sm font-bold mb-3">Age</h3>
              <div className="flex flex-wrap gap-2">
                {ageOptions.map((a) => (
                  <Chip
                    key={a.id}
                    active={pendingAge === a.slug}
                    onClick={() => setPendingAge(pendingAge === a.slug ? "all" : a.slug)}
                  >
                    {a.name}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Size */}
            <div>
              <h3 className="text-sm font-bold mb-3">Size</h3>
              <div className="flex flex-wrap gap-2">
                {sizeOptions.map((s) => (
                  <Chip
                    key={s.id}
                    active={pendingSize === s.id}
                    onClick={() => setPendingSize(pendingSize === s.id ? "all" : s.id)}
                  >
                    {s.name}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Design */}
            <div>
              <h3 className="text-sm font-bold mb-3">Design</h3>
              <div className="flex flex-wrap gap-2">
                {PATTERN_OPTIONS.map((p) => (
                  <Chip
                    key={p}
                    active={pendingPattern === p}
                    onClick={() => setPendingPattern(pendingPattern === p ? null : p)}
                  >
                    {p}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Max price — not wired to any real API param; visual only */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold">Max price</h3>
                <span className="text-sm font-bold text-cb-terracotta">₹{pendingMaxPrice}</span>
              </div>
              <input
                type="range"
                min={MIN_PRICE}
                max={MAX_PRICE}
                step={50}
                value={pendingMaxPrice}
                onChange={(e) => setPendingMaxPrice(Number(e.target.value))}
                className="w-full accent-cb-terracotta"
              />
              <div className="flex justify-between text-xs text-cb-muted-fg mt-1">
                <span>₹{MIN_PRICE}</span>
                <span>₹{MAX_PRICE}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t p-5 flex items-center gap-4">
            {hasPending ? (
              <button
                type="button"
                onClick={handleClearFilters}
                className="text-sm font-semibold text-cb-fg"
              >
                Clear all
              </button>
            ) : (
              <span />
            )}
            <Button
              onClick={handleApplyFilters}
              className="ml-auto flex-1 rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white h-12"
            >
              Show {itemCount} items
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
