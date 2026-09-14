"use client";

import { X } from "lucide-react";
import type { ActiveFilterChip, ActiveFilterParam } from "@/lib/catalog/active-filters";

interface ActiveFilterChipsProps {
  chips: ActiveFilterChip[];
  onRemove: (param: ActiveFilterParam) => void;
  onClearAll: () => void;
}

/** Row under the /products toolbar: what the Filters sheet applied, each removable on its own. */
export default function ActiveFilterChips({ chips, onRemove, onClearAll }: ActiveFilterChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Applied filters">
      {chips.map((chip) => (
        <span
          key={chip.param}
          className="inline-flex items-center gap-1 rounded-full bg-cb-muted pl-3 pr-1.5 py-1 text-[12.5px] text-cb-fg"
        >
          <span className="text-cb-muted-fg">{chip.label}:</span>
          <span className="font-semibold">{chip.value}</span>
          <button
            type="button"
            onClick={() => onRemove(chip.param)}
            aria-label={`Remove ${chip.label} filter ${chip.value}`}
            className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-cb-muted-fg hover:bg-white hover:text-cb-fg"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
      <button type="button" onClick={onClearAll} className="text-sm font-semibold text-cb-terracotta">
        Clear all filters
      </button>
    </div>
  );
}
