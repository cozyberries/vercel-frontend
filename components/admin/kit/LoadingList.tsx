export function LoadingList({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          data-skeleton-row
          className="animate-pulse rounded-2xl border border-cb-border bg-cb-white p-4"
        >
          <div className="mb-2 h-4 w-2/5 rounded bg-cb-linen" />
          <div className="mb-3 h-3 w-3/5 rounded bg-cb-linen" />
          <div className="h-9 w-full rounded-xl bg-cb-linen" />
        </div>
      ))}
    </div>
  );
}
