"use client";

export interface FilterChip<V extends string> {
  value: V;
  label: string;
}

export function FilterChips<V extends string>({
  chips,
  value,
  onChange,
  label,
}: {
  chips: FilterChip<V>[];
  value: V;
  onChange: (value: V) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
      {chips.map((c) => {
        const checked = c.value === value;
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(c.value)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              checked
                ? "border-cb-fg bg-cb-fg text-white"
                : "border-cb-border bg-cb-white text-cb-fg"
            }`}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
