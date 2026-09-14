"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import ProductCard from "@/components/product-card";
import FilterSheet from "@/components/FilterSheet";
import SortSheet from "@/components/SortSheet";
import type { Product } from "@/lib/services/api";
import { useCatalog, useRanking } from "@/hooks/useCatalog";
import { MIN_QUERY_LENGTH, ageFilterOptions, applyFilters, filtersKey, normalizeQuery, parseFilters } from "@/lib/catalog/filter";
import { colourOptionsFor, designOptionsFor } from "@/lib/catalog/colours";
import type { Snapshot } from "@/lib/catalog/types";
import type { FilterValues } from "@/components/FilterSheet";
import { Loader, Search, X, LayoutGrid, LayoutList } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { trackSearch } from "@/lib/analytics/meta-pixel";

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 300;
const HIDDEN_CATEGORY_SLUGS = new Set(["accessories", "newborn-accessories"]);

/* ─── Extracted search input ─── */
interface ProductSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClear: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  disabled?: boolean;
  className?: string;
}

function ProductSearchInput({
  value,
  onChange,
  onSubmit,
  onClear,
  inputRef,
  disabled = false,
  className,
}: ProductSearchInputProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled) onSubmit(e);
      }}
      className={className}
    >
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-cb-muted-fg" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search organic muslin, gifts…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="pl-10 pr-9 h-11 rounded-full border-0 bg-cb-muted focus-visible:ring-1 focus-visible:ring-cb-terracotta"
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-cb-muted-fg hover:text-cb-fg"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {disabled && (
          <Loader className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-pulse text-cb-muted-fg" />
        )}
      </div>
    </form>
  );
}

interface ProductsClientProps {
  snapshot: Snapshot;
  initialRanking: { q: string; slugs: string[] | null } | null;
}

/** Update the URL without a server round trip. Next syncs pushState/replaceState into useSearchParams. */
function navigate(params: URLSearchParams, mode: "push" | "replace") {
  const query = params.toString();
  const url = query ? `/products?${query}` : "/products";
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

function setOrDelete(params: URLSearchParams, name: string, value: string | null) {
  if (value === null || value === "" || value === "all") params.delete(name);
  else params.set(name, value);
}

export default function ProductsClient({ snapshot: initialSnapshot, initialRanking }: ProductsClientProps) {
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();

  // ── Data: server snapshot first, background refreshes afterwards ──
  const { data: snapshot = initialSnapshot } = useCatalog(initialSnapshot);
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);
  const { data: ranking } = useRanking(filters.search, filters, initialRanking ?? undefined);
  const rankingActive = normalizeQuery(filters.search).length >= MIN_QUERY_LENGTH;
  const filtered = useMemo(
    () => applyFilters(snapshot.products, filters, rankingActive ? ranking ?? null : null),
    [snapshot.products, filters, ranking, rankingActive],
  );
  const filterSignature = `${filtersKey(filters)}|${filters.search}`;

  // ── Options come from the snapshot: nothing is fetched on mount ──
  const categories = useMemo(
    () =>
      snapshot.reference.categories
        .filter((c) => !HIDDEN_CATEGORY_SLUGS.has(c.slug))
        .map((c) => ({ id: c.slug, name: c.name, slug: c.slug })),
    [snapshot.reference.categories],
  );
  const genderOptions = useMemo(
    () => snapshot.reference.genders.map((g) => ({ id: g.slug, name: g.name, display_order: g.display_order })),
    [snapshot.reference.genders],
  );
  // Age doubles as size here: the sheet shows the homepage bands (single sizes folded into their
  // group, e.g. 3-4Y/4-5Y/5-6Y → "3-6 Years") and there is no separate Size group. `?size=` from
  // old links is still honoured by the filter engine.
  const ageOptions = useMemo(
    () => ageFilterOptions(snapshot.reference).map((a) => ({ id: a.slug, slug: a.slug, name: a.name, display_order: a.display_order })),
    [snapshot.reference],
  );
  // Design = prints, Colour = the prints' base colours; only those some product actually uses.
  const designOptions = useMemo(
    () => designOptionsFor(snapshot.reference, snapshot.products),
    [snapshot.reference, snapshot.products],
  );
  const colourOptions = useMemo(
    () => colourOptionsFor(snapshot.reference, snapshot.products),
    [snapshot.reference, snapshot.products],
  );

  // ── URL state ──
  const currentCategory = filters.category;
  const currentSort = filters.sortBy;
  const currentSortOrder = filters.sortOrder;
  const currentView = searchParams.get("view") === "list" ? "list" : "grid";
  const effectiveView = isMobile === false ? "grid" : currentView;

  const setParams = useCallback(
    (mutate: (params: URLSearchParams) => void, mode: "push" | "replace" = "push") => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      navigate(params, mode);
    },
    [searchParams],
  );

  // Desktop never shows list view; strip the param so it does not linger in the URL
  useEffect(() => {
    if (isMobile === false && searchParams.get("view")) setParams((p) => p.delete("view"), "replace");
  }, [isMobile, searchParams, setParams]);

  // ── Infinite scroll over the local list ──
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filterSignature]);
  const hasMore = visibleCount < filtered.length;
  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = sentinelRef.current;
    if (!element || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisibleCount((n) => Math.min(n + PAGE_SIZE, filtered.length));
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, filtered.length]);

  // Hide footer while more cards can appear (visibility preserves layout)
  useEffect(() => {
    document.body.classList.toggle("hide-footer", hasMore);
    return () => document.body.classList.remove("hide-footer");
  }, [hasMore]);

  // Scroll to top when a filter (not the search text) changes, except on first render
  const firstRenderRef = useRef(true);
  const structuralKey = filtersKey(filters);
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [structuralKey]);

  // Persist product slugs so the product detail page can show prev/next navigation
  useEffect(() => {
    try {
      sessionStorage.setItem("productListSlugs", JSON.stringify(filtered.map((p) => p.slug)));
    } catch {
      // sessionStorage may be unavailable
    }
  }, [filtered]);

  // Restore scroll to the product that was clicked when returning from product detail
  const restoreIndexRef = useRef<number | null>(null);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("productsPageScrollToIndex");
      if (saved === null) return;
      sessionStorage.removeItem("productsPageScrollToIndex");
      const index = parseInt(saved, 10);
      if (!Number.isFinite(index) || index < 0) return;
      restoreIndexRef.current = index;
      setVisibleCount((n) => Math.max(n, Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE));
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    const index = restoreIndexRef.current;
    if (index === null || index >= visible.length) return;
    document.querySelector(`[data-product-index="${index}"]`)?.scrollIntoView({ behavior: "auto", block: "center" });
    restoreIndexRef.current = null;
  }, [visible.length]);

  // ── Search: instant local matching, debounced URL update, server ranking via useRanking ──
  const [searchInput, setSearchInput] = useState(filters.search);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const skipSyncRef = useRef(false);
  useEffect(() => {
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    setSearchInput(filters.search);
  }, [filters.search]);
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === filters.search) return;
    const timer = setTimeout(() => {
      skipSyncRef.current = true;
      setParams((p) => setOrDelete(p, "search", trimmed || null), "replace");
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, filters.search, setParams]);
  useEffect(() => {
    if (filters.search.trim()) trackSearch({ query: filters.search });
  }, [filters.search]);

  // ── Handlers: same URL semantics as before, no navigation round trip ──
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    skipSyncRef.current = true;
    setParams((p) => setOrDelete(p, "search", searchInput.trim() || null));
  };
  const handleClearSearch = () => {
    setSearchInput("");
    setParams((p) => p.delete("search"));
    searchInputRef.current?.focus();
  };
  const handleCategoryChange = (category: string) => setParams((p) => setOrDelete(p, "category", category));
  const handleSortChange = (sort: string) =>
    setParams((p) => {
      if (sort === "default") {
        p.delete("sortBy");
        p.delete("sortOrder");
      } else {
        p.set("sortBy", "price");
        p.set("sortOrder", sort === "asc" ? "asc" : "desc");
      }
    });
  const handleApplyFilters = useCallback(
    (values: FilterValues) =>
      setParams((p) => {
        setOrDelete(p, "gender", values.gender);
        setOrDelete(p, "age", values.age);
        setOrDelete(p, "design", values.design);
        setOrDelete(p, "colour", values.colour);
        p.delete("color");
      }),
    [setParams],
  );
  const handleClearFilters = () => {
    setSearchInput("");
    navigate(new URLSearchParams(currentView === "list" ? { view: "list" } : {}), "push");
  };
  const handleViewChange = (view: "grid" | "list") =>
    setParams((p) => setOrDelete(p, "view", view === "list" ? "list" : null), "replace");

  const hasActiveFilters =
    currentCategory !== "all" ||
    filters.size !== "all" ||
    filters.gender !== "all" ||
    filters.age !== "all" ||
    filters.design !== "all" ||
    filters.colour !== "all" ||
    currentSort !== "default" ||
    filters.featured ||
    filters.search !== "";
  const totalItems = filtered.length;
  // ListCard is the list-shaped subset of Product; ProductCard only reads those fields.
  const cards = visible as unknown as Product[];

  /* ─── Shared toolbar: search + category chips + filter/sort/count row ─── */
  const toolbar = (
    <div className="flex flex-col gap-3">
      <ProductSearchInput
        value={searchInput}
        onChange={setSearchInput}
        onSubmit={handleSearchSubmit}
        onClear={handleClearSearch}
        inputRef={searchInputRef}
        className="w-full"
      />

      {/* Category chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Chip active={currentCategory === "all"} onClick={() => handleCategoryChange("all")}>
          All
        </Chip>
        {categories.map((cat) => (
          <Chip key={cat.id} active={currentCategory === cat.slug} onClick={() => handleCategoryChange(cat.slug)}>
            {cat.name}
          </Chip>
        ))}
      </div>

      {/* Filters + Sort + item count */}
      <div className="flex items-center gap-2">
        <FilterSheet
          genderOptions={genderOptions}
          ageOptions={ageOptions}
          designOptions={designOptions}
          colourOptions={colourOptions}
          currentGender={filters.gender}
          currentAge={filters.age}
          currentDesign={filters.design}
          currentColour={filters.colour}
          itemCount={totalItems}
          onApplyFilters={handleApplyFilters}
          onClearFilters={handleClearFilters}
        />
        <SortSheet currentSort={currentSort === "price" ? currentSortOrder : "default"} onSelect={handleSortChange} />
        <span className="ml-auto text-sm text-cb-muted-fg whitespace-nowrap">
          {totalItems} item{totalItems === 1 ? "" : "s"}
        </span>
        {/* View toggle: mobile only */}
        {cards.length > 0 && isMobile === true && (
          <div className="flex items-center border rounded-md p-0.5">
            <Button
              variant={effectiveView === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => handleViewChange("grid")}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={effectiveView === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => handleViewChange("list")}
              aria-label="List view"
            >
              <LayoutList className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {hasActiveFilters && (
        <button type="button" onClick={handleClearFilters} className="self-start text-sm font-semibold text-cb-terracotta">
          Clear all filters
        </button>
      )}
    </div>
  );

  return (
    <>
      <div className="mb-6">{toolbar}</div>

      {cards.length > 0 ? (
        <>
          <div
            className={
              effectiveView === "list"
                ? "flex flex-col gap-4 mb-8"
                : "grid grid-cols-2 lg:grid-cols-4 gap-[14px] lg:gap-[18px] mb-8"
            }
          >
            {cards.map((product, index) => (
              <div
                key={product.id}
                data-product-index={index}
                className={effectiveView === "list" ? "w-full max-w-full" : undefined}
              >
                <ProductCard product={product} index={index} currentView={effectiveView} />
              </div>
            ))}
          </div>

          {/* Infinite scroll sentinel: appends from memory, so no skeleton is needed */}
          <div ref={sentinelRef} data-testid="infinite-scroll-sentinel" className="py-4" aria-hidden="true" />
        </>
      ) : (
        <div className="text-center py-16">
          <div className="max-w-md mx-auto">
            <div className="mb-6">
              <svg className="mx-auto h-24 w-24 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M9 5l7 7-7 7"
                />
              </svg>
            </div>
            <h3 className="text-xl font-medium text-gray-900 mb-3">No products found</h3>
            <p className="text-gray-500 mb-6">
              We couldn&apos;t find any products matching your current filters. Try adjusting your search criteria.
            </p>
            <div className="space-y-3">
              <Button variant="outline" onClick={handleClearFilters} className="mr-3">
                Clear All Filters
              </Button>
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
