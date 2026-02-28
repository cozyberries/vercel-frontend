export default function ProductCardSkeleton() {
  return (
    <div className="flex flex-col lg:min-h-[320px] min-h-[300px] overflow-hidden bg-white rounded-2xl border border-gray-200/50 shadow-sm">
      {/* Image area */}
      <div className="relative lg:h-[78%] h-[72%] bg-gray-200 animate-pulse" />

      {/* Content area */}
      <div className="flex flex-col lg:h-[22%] h-[28%] min-h-0 border-t border-gray-200/50 px-2 py-2 lg:px-3 lg:py-2 justify-between gap-1">
        {/* Title */}
        <div className="h-3 w-3/4 rounded bg-gray-200 animate-pulse" />

        {/* Size badges */}
        <div className="flex gap-1">
          <div className="h-4 w-8 rounded bg-gray-200 animate-pulse" />
          <div className="h-4 w-8 rounded bg-gray-200 animate-pulse" />
          <div className="h-4 w-8 rounded bg-gray-200 animate-pulse" />
        </div>

        {/* Category + price row */}
        <div className="flex items-center justify-between">
          <div className="h-3 w-16 rounded bg-gray-200 animate-pulse" />
          <div className="h-3 w-12 rounded bg-gray-200 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
