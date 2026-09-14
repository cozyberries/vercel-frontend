"use client";

import { useMemo, useState } from "react";
import { Check, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ColourOption, DesignOption } from "@/lib/catalog/colours";
import { facetCounts, isOptionAvailable } from "@/lib/catalog/facets";
import type { Filters, ListCard } from "@/lib/catalog/types";

interface Option {
  id: string;
  name: string;
  display_order: number;
}

interface AgeOption extends Option {
  slug: string;
}

export interface FilterValues {
  gender: string;
  /** Age slug ("0-3m", "3-6y") or "all". Size is the same axis and is not offered separately. */
  age: string;
  /** Print slug ("petal-pops") or "all". */
  design: string;
  /** Base colour slug ("white") or "all". */
  colour: string;
}

interface FilterSheetProps {
  genderOptions: Option[];
  /** From lib/catalog/filter ageFilterOptions: the homepage bands, groups folded in. */
  ageOptions: AgeOption[];
  /** Prints in the catalog, from lib/catalog/colours designOptionsFor. */
  designOptions: DesignOption[];
  /** Base colours in the catalog, from lib/catalog/colours colourOptionsFor. */
  colourOptions: ColourOption[];
  currentGender: string;
  currentAge: string;
  currentDesign: string;
  currentColour: string;
  itemCount: number;
  /**
   * Catalogue and the filters currently applied outside the sheet (category, search…). Options
   * that would leave zero products given the pending choices are disabled. Omit to disable nothing.
   */
  products?: ListCard[];
  baseFilters?: Filters;
  onApplyFilters: (filters: FilterValues) => void;
  onClearFilters: () => void;
  disabled?: boolean;
}

const MIN_PRICE = 250;
const MAX_PRICE = 2000;

export default function FilterSheet({
  genderOptions,
  ageOptions,
  designOptions,
  colourOptions,
  currentGender,
  currentAge,
  currentDesign,
  currentColour,
  itemCount,
  products,
  baseFilters,
  onApplyFilters,
  onClearFilters,
  disabled = false,
}: FilterSheetProps) {
  const [open, setOpen] = useState(false);

  // Local pending state — only sent to parent on "Show N items"
  const [pendingGender, setPendingGender] = useState(currentGender);
  const [pendingAge, setPendingAge] = useState(currentAge);
  const [pendingDesign, setPendingDesign] = useState(currentDesign);
  const [pendingColour, setPendingColour] = useState(currentColour);
  // Not backed by any API param — visual only, never sent to the parent.
  const [pendingMaxPrice, setPendingMaxPrice] = useState(MAX_PRICE);

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setPendingGender(currentGender);
      setPendingAge(currentAge);
      setPendingDesign(currentDesign);
      setPendingColour(currentColour);
      setPendingMaxPrice(MAX_PRICE);
    }
    setOpen(isOpen);
  };

  const handleApplyFilters = () => {
    onApplyFilters({
      gender: pendingGender,
      age: pendingAge,
      design: pendingDesign,
      colour: pendingColour,
    });
    setOpen(false);
  };

  const handleClearFilters = () => {
    setPendingDesign("all");
    setPendingColour("all");
    setPendingMaxPrice(MAX_PRICE);
    onClearFilters();
    setOpen(false);
  };

  // Re-count every option against the pending choices so dead ends are greyed out up front.
  const counts = useMemo(() => {
    if (!products || products.length === 0 || !baseFilters) return null;
    return facetCounts(
      products,
      baseFilters,
      { gender: pendingGender, age: pendingAge, design: pendingDesign, colour: pendingColour },
      {
        genders: genderOptions.map((g) => g.name),
        ages: ageOptions.map((a) => a.slug),
        designs: designOptions.map((d) => d.slug),
        colours: colourOptions.map((c) => c.slug),
      },
    );
  }, [products, baseFilters, pendingGender, pendingAge, pendingDesign, pendingColour, genderOptions, ageOptions, designOptions, colourOptions]);

  const hasPending =
    pendingGender !== "all" ||
    pendingAge !== "all" ||
    pendingDesign !== "all" ||
    pendingColour !== "all" ||
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
                {genderOptions.map((g) => {
                  // The URL keeps the name but parseFilters lowercases it, so compare case-insensitively.
                  const on = pendingGender.toLowerCase() === g.name.toLowerCase();
                  return (
                    <Chip
                      key={g.id}
                      active={on}
                      disabled={!isOptionAvailable(counts, "gender", g.name, pendingGender)}
                      onClick={() => setPendingGender(on ? "all" : g.name)}
                    >
                      {g.name}
                    </Chip>
                  );
                })}
              </div>
            </div>

            {/* Age — also the size axis in this store, so there is no separate Size group */}
            <div>
              <h3 className="text-sm font-bold mb-3">Age</h3>
              <div className="flex flex-wrap gap-2">
                {ageOptions.map((a) => (
                  <Chip
                    key={a.id}
                    active={pendingAge === a.slug}
                    disabled={!isOptionAvailable(counts, "age", a.slug, pendingAge)}
                    onClick={() => setPendingAge(pendingAge === a.slug ? "all" : a.slug)}
                  >
                    {a.name}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Design — the catalog's prints (Petal Pops, Lilac Blossom, …) */}
            {designOptions.length > 0 && (
              <div>
                <h3 className="text-sm font-bold mb-3">Design</h3>
                <div className="flex flex-wrap gap-2">
                  {designOptions.map((d) => (
                    <Chip
                      key={d.slug}
                      active={pendingDesign === d.slug}
                      disabled={!isOptionAvailable(counts, "design", d.slug, pendingDesign)}
                      onClick={() => setPendingDesign(pendingDesign === d.slug ? "all" : d.slug)}
                    >
                      {d.name}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            {/* Colour — the actual clothing colour each print sits on (White, Lilac, …) */}
            {colourOptions.length > 0 && (
              <div>
                <h3 className="text-sm font-bold mb-3">Colour</h3>
                <div className="flex flex-wrap gap-3">
                  {colourOptions.map((c) => {
                    const on = pendingColour === c.slug;
                    const available = isOptionAvailable(counts, "colour", c.slug, pendingColour);
                    return (
                      <button
                        key={c.slug}
                        type="button"
                        onClick={() => setPendingColour(on ? "all" : c.slug)}
                        aria-label={c.name}
                        aria-pressed={on}
                        disabled={!available}
                        title={available ? c.name : `${c.name} — no products with the other filters`}
                        className="flex flex-col items-center gap-1.5 w-14 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {/* Visible neutral border so pale swatches (White, Cream) read on the white sheet */}
                        <span
                          data-testid={`swatch-${c.slug}`}
                          className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-cb-border"
                          style={{
                            background: c.hex,
                            boxShadow: on ? "0 0 0 2px var(--cb-terracotta)" : "none",
                          }}
                        >
                          {/* Tick on the chosen swatch: the ring alone is easy to miss on pale colours */}
                          {on && (
                            <span
                              data-testid="swatch-check"
                              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/85 shadow-sm"
                            >
                              <Check className="h-4 w-4 text-cb-terracotta-deep" strokeWidth={3} aria-hidden="true" />
                            </span>
                          )}
                        </span>
                        <span className={`text-[11.5px] font-medium ${on ? "text-cb-terracotta-deep" : "text-cb-muted-fg"}`}>
                          {c.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

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
