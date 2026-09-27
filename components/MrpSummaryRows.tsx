import { mrpTotals } from "@/lib/utils/discount";

interface MrpSummaryRowsProps {
  items: { price: number; quantity: number }[];
  /** An existing order's created_at: orders placed before the MRP was shown get no rows. */
  placedAt?: string;
}

/**
 * "Total MRP" and "Discount on MRP" rows for a bill summary, placed above the subtotal row.
 * Display only: the subtotal and total below them are unchanged.
 */
export default function MrpSummaryRows({ items, placedAt }: MrpSummaryRowsProps) {
  const { totalMrp, mrpSavings } = mrpTotals(items, placedAt);
  if (mrpSavings <= 0) return null;
  return (
    <>
      <div className="flex items-center justify-between text-sm">
        <span className="text-cb-muted-fg">Total MRP</span>
        <span className="font-semibold text-cb-fg">₹{totalMrp.toFixed(0)}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-cb-muted-fg">Discount on MRP</span>
        <span className="font-semibold text-cb-terracotta">−₹{mrpSavings.toFixed(0)}</span>
      </div>
    </>
  );
}
