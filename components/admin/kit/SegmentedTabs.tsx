"use client";

export interface SegmentedTab<K extends string> {
  key: K;
  label: string;
  count?: number;
}

export function SegmentedTabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: SegmentedTab<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 rounded-xl bg-cb-linen p-1">
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-sm font-semibold transition-colors ${
              active ? "bg-cb-white text-cb-fg shadow-sm" : "text-cb-muted-fg"
            }`}
          >
            <span className="truncate">{t.label}</span>
            {t.count !== undefined && t.count > 0 && (
              <span
                className={`rounded-full px-1.5 text-xs ${
                  active ? "bg-cb-terracotta text-white" : "bg-cb-white text-cb-fg"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
