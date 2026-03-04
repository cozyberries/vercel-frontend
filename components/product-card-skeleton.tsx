export default function ProductCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden bg-white rounded-2xl shadow-sm lg:border lg:border-gray-200/50 lg:min-h-[320px]">
      {/* Image area */}
      <div className="aspect-[4/5] lg:aspect-auto lg:h-[78%] bg-gray-200 animate-pulse" />

      {/* Content area */}
      <div className="flex flex-col min-h-0 px-3 py-2.5 lg:h-[22%] lg:px-3 lg:py-2 justify-between gap-1.5 lg:gap-1">
        {/* Title */}
        <div className="h-4 lg:h-3 w-3/4 rounded bg-gray-200 animate-pulse" />

        {/* Size badges */}
        <div className="flex gap-1.5 lg:gap-1">
          <div className="h-5 lg:h-4 w-10 lg:w-8 rounded-md lg:rounded bg-gray-200 animate-pulse" />
          <div className="h-5 lg:h-4 w-10 lg:w-8 rounded-md lg:rounded bg-gray-200 animate-pulse" />
          <div className="h-5 lg:h-4 w-10 lg:w-8 rounded-md lg:rounded bg-gray-200 animate-pulse" />
        </div>

        {/* Category + price row */}
        <div className="flex items-center justify-between">
          <div className="h-3.5 lg:h-3 w-16 rounded bg-gray-200 animate-pulse" />
          <div className="h-3.5 lg:h-3 w-24 lg:w-12 rounded bg-gray-200 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
