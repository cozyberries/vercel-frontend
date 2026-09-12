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
}

interface FilterSheetProps {
  sizeOptions: Option[];
  genderOptions: Option[];
  ageOptions: AgeOption[];
  currentSize: string;
  currentGender: string;
  currentAge: string;
  itemCount: number;
  onApplyFilters: (filters: FilterValues) => void;
  onClearFilters: () => void;
  disabled?: boolean;
}

// No backend field for pattern/design — chips are UI-only and don't affect results.
const PATTERN_OPTIONS = ["Solid", "Stripe", "Polka", "Floral", "Check"];

// No backend color palette exists (the catalog's `colors` table holds print/pattern
// names like "Petal Pops", not a swatch palette) — these match the design mock's
// swatch reference exactly but are visual only and don't affect results.
const SWATCHES = [
  { name: "Sage", hex: "#aebd9c" },
  { name: "Oat", hex: "#e4d4ba" },
  { name: "Clay", hex: "#c98b6b" },
  { name: "Blush", hex: "#e3c2bd" },
  { name: "Almond", hex: "#ead7bd" },
  { name: "Mist", hex: "#c4cdc9" },
  { name: "Stone", hex: "#d0c7ba" },
  { name: "Fern", hex: "#8ba27e" },
];

const MIN_PRICE = 250;
const MAX_PRICE = 2000;

export default function FilterSheet({
  sizeOptions,
  genderOptions,
  ageOptions,
  currentSize,
  currentGender,
  currentAge,
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
  // Not backed by real data/API — visual only, never sent to the parent.
  const [pendingColor, setPendingColor] = useState<string | null>(null);
  const [pendingPattern, setPendingPattern] = useState<string | null>(null);
  const [pendingMaxPrice, setPendingMaxPrice] = useState(MAX_PRICE);

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setPendingSize(currentSize);
      setPendingGender(currentGender);
      setPendingAge(currentAge);
      setPendingColor(null);
      setPendingPattern(null);
      setPendingMaxPrice(MAX_PRICE);
    }
    setOpen(isOpen);
  };

  const handleApplyFilters = () => {
    onApplyFilters({ size: pendingSize, gender: pendingGender, age: pendingAge });
    setOpen(false);
  };

  const handleClearFilters = () => {
    setPendingColor(null);
    setPendingPattern(null);
    setPendingMaxPrice(MAX_PRICE);
    onClearFilters();
    setOpen(false);
  };

  const hasPending =
    pendingSize !== "all" ||
    pendingGender !== "all" ||
    pendingAge !== "all" ||
    pendingColor !== null ||
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
                    active={pendingGender === g.name}
                    onClick={() => setPendingGender(pendingGender === g.name ? "all" : g.name)}
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
                    active={pendingSize === s.name}
                    onClick={() => setPendingSize(pendingSize === s.name ? "all" : s.name)}
                  >
                    {s.name}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Design — not wired to any real data; visual only */}
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

            {/* Colour — no backend palette exists (catalog only has print names); visual only */}
            <div>
              <h3 className="text-sm font-bold mb-3">Colour</h3>
              <div className="flex flex-wrap gap-3">
                {SWATCHES.map((c) => {
                  const on = pendingColor === c.name;
                  return (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => setPendingColor(on ? null : c.name)}
                      aria-label={c.name}
                      title={c.name}
                      className="flex flex-col items-center gap-1.5 w-14"
                    >
                      <span
                        className="block h-11 w-11 rounded-full border-2 border-white"
                        style={{
                          background: c.hex,
                          boxShadow: on ? "0 0 0 2px var(--cb-terracotta)" : "0 0 0 1px var(--cb-border)",
                        }}
                      />
                      <span className={`text-[11.5px] font-medium ${on ? "text-cb-terracotta-deep" : "text-cb-muted-fg"}`}>
                        {c.name}
                      </span>
                    </button>
                  );
                })}
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
