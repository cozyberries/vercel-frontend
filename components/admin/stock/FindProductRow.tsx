"use client";

import Image from "next/image";
import { useId } from "react";
import { STATUS_COLORS } from "@/components/admin/charts/chart-colors";
import { FIND_STATE_LABEL, formatFindCounts, type FindProduct, type FindState } from "@/lib/admin/stock-find";

const STATE_COLORS: Record<FindState, string> = {
  in: STATUS_COLORS.in,
  low: STATUS_COLORS.low,
  last: STATUS_COLORS.low,
  out: STATUS_COLORS.out,
};

/** One product in the Find view: photo, name, counts; open → one row per size with stall and home. */
export function FindProductRow({ product, open, onToggle }: { product: FindProduct; open: boolean; onToggle: () => void }) {
  const listId = useId();
  return (
    <li className="py-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={onToggle}
        className="flex min-h-11 w-full items-center gap-3 text-left"
      >
        {product.image ? (
          <Image src={product.image} alt="" width={48} height={48} unoptimized className="h-12 w-12 shrink-0 rounded-md object-cover" />
        ) : (
          <span aria-hidden="true" className="h-12 w-12 shrink-0 rounded-md bg-cb-linen" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm text-cb-fg">{product.name}</span>
          <span className="block text-xs text-cb-muted-fg">{formatFindCounts(product.counts)}</span>
        </span>
        <span aria-hidden="true" className="text-cb-muted-fg">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <ul id={listId} aria-label={`${product.name} sizes`} className="mt-2 space-y-1.5 pl-[3.75rem]">
          {product.sizes.map((s) => (
            <li key={s.variant_slug} data-state={s.state} className="flex min-h-8 items-center gap-3 text-sm">
              <span className="w-12 shrink-0 whitespace-nowrap font-medium text-cb-fg">{s.size_label}</span>
              <span className="flex-1 text-cb-fg">{s.state === "out" ? "—" : `Stall ${s.stall} · Home ${s.home}`}</span>
              <span
                className="whitespace-nowrap rounded-md border border-cb-border py-0.5 pl-1.5 pr-2 text-xs text-cb-fg"
                style={{ borderLeftColor: STATE_COLORS[s.state], borderLeftWidth: 3 }}
              >
                {s.state === "last" ? <strong>{FIND_STATE_LABEL.last}</strong> : FIND_STATE_LABEL[s.state]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
