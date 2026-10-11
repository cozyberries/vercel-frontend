"use client";

import { useId, useMemo, useState } from "react";
import { EmptyState, FilterChips, type FilterChip } from "@/components/admin/kit";
import type { StockProductRow } from "@/lib/admin/stock-metrics";
import {
  buildFindTree,
  findEmptyTitle,
  findSizeOptions,
  formatFindCounts,
  knownSize,
  type FindFilters,
  type FindGender,
} from "@/lib/admin/stock-find";
import { FindProductRow } from "./FindProductRow";

const GENDER_CHIPS: FilterChip<FindGender>[] = [
  { value: "any", label: "Any" },
  { value: "girl", label: "Girl" },
  { value: "boy", label: "Boy" },
];
const ANY_SIZE = "any";
const NONE = new Set<string>();

/**
 * Gender + size filters over category → product → size. With a size picked everything starts
 * open (the "other options" list); a tap collapses a row until the size changes.
 */
export function StockFinder({
  products,
  filters,
  onChange,
}: {
  products: StockProductRow[];
  filters: FindFilters;
  onChange: (next: FindFilters) => void;
}) {
  const headingId = useId();
  const sizeOptions = useMemo(() => findSizeOptions(products), [products]);
  const size = knownSize(filters.size, sizeOptions);
  const tree = useMemo(() => buildFindTree(products, { gender: filters.gender, size }), [products, filters.gender, size]);

  // Rows the user toggled away from the default (closed with no size, open with a size). Any size
  // change clears them — reset during render (React's "adjust state on prop change" pattern), so
  // going 2-3Y → 1-2Y → 2-3Y re-opens everything.
  const [toggled, setToggled] = useState<{ size: string | null; keys: Set<string> }>({ size, keys: NONE });
  if (toggled.size !== size) setToggled({ size, keys: NONE });
  const keys = toggled.size === size ? toggled.keys : NONE;
  const isOpen = (key: string) => (size !== null) !== keys.has(key);
  const toggle = (key: string) => {
    const next = new Set(keys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setToggled({ size, keys: next });
  };

  const sizeChips: FilterChip<string>[] = [{ value: ANY_SIZE, label: "Any" }, ...sizeOptions.map((o) => ({ value: o.slug, label: o.label }))];
  const sizeLabel = sizeOptions.find((o) => o.slug === size)?.label ?? null;

  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-3 rounded-2xl border border-cb-border bg-cb-white p-4">
      <div>
        <h2 id={headingId} className="text-sm font-semibold text-cb-fg">
          Find stock
        </h2>
        <p className="text-xs text-cb-muted-fg">The stall keeps 1 of each size in stock; the rest is at home.</p>
      </div>
      <FilterChips large chips={GENDER_CHIPS} value={filters.gender} onChange={(gender) => onChange({ gender, size })} label="Gender" />
      <FilterChips
        large
        chips={sizeChips}
        value={size ?? ANY_SIZE}
        onChange={(v) => onChange({ gender: filters.gender, size: v === ANY_SIZE ? null : v })}
        label="Size"
      />
      {tree.length === 0 ? (
        <EmptyState title={findEmptyTitle(filters.gender, sizeLabel)} />
      ) : (
        <ul className="divide-y divide-cb-border">
          {tree.map((c) => {
            const key = `c:${c.slug ?? ""}`;
            const open = isOpen(key);
            return (
              <li key={key} className="py-1">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => toggle(key)}
                  className="flex min-h-11 w-full items-center gap-2 text-left"
                >
                  <span className="min-w-0 flex-1 break-words text-sm font-semibold text-cb-fg">{c.name}</span>
                  <span className="text-xs text-cb-muted-fg">{formatFindCounts(c.counts)}</span>
                  <span aria-hidden="true" className="text-cb-muted-fg">
                    {open ? "▾" : "▸"}
                  </span>
                </button>
                {open && (
                  <ul aria-label={`${c.name} products`} className="divide-y divide-cb-border pl-2">
                    {c.products.map((p) => (
                      <FindProductRow key={p.slug} product={p} open={isOpen(`p:${p.slug}`)} onToggle={() => toggle(`p:${p.slug}`)} />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
