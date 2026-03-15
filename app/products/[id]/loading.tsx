export default function ProductLoading() {
  return (
    <div className="container mx-auto px-4 py-4 md:py-8 pb-40 md:pb-8">
      <div className="grid md:grid-cols-2 gap-8 lg:gap-12 animate-pulse">
        {/* Left: image gallery skeleton */}
        <div className="space-y-4 lg:space-y-0 lg:flex lg:gap-4">
          {/* Thumbnails */}
          <div className="hidden lg:flex flex-col gap-2 w-20">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="aspect-square bg-gray-200 w-20 h-20" />
            ))}
          </div>
          {/* Main image */}
          <div className="lg:flex-1 aspect-square bg-gray-200" />
        </div>

        {/* Right: info skeleton */}
        <div className="space-y-4 pt-4">
          {/* Category badge */}
          <div className="h-5 w-24 bg-gray-200 rounded" />
          {/* Product name */}
          <div className="h-8 w-3/4 bg-gray-200 rounded" />
          {/* Rating */}
          <div className="h-4 w-32 bg-gray-200 rounded" />
          {/* Price */}
          <div className="h-7 w-20 bg-gray-200 rounded" />
          {/* Sizes */}
          <div className="space-y-2">
            <div className="h-4 w-16 bg-gray-200 rounded" />
            <div className="flex gap-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 w-16 bg-gray-200 rounded" />
              ))}
            </div>
          </div>
          {/* CTA buttons */}
          <div className="flex gap-3 mt-6">
            <div className="h-12 flex-1 bg-gray-200 rounded" />
            <div className="h-12 flex-1 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
