"use client";

/**
 * Wrapper that holds all below-fold home page sections that need client-only rendering.
 * `ssr: false` is only valid inside Client Components — this wrapper allows us to
 * keep app/page.tsx as a Server Component while still using dynamic imports.
 */
import dynamic from "next/dynamic";

// Lightweight loading placeholders shown while the real components hydrate.

function ProductSkeleton() {
  return (
    <div className="py-8 px-4">
      <div className="mx-auto mb-6 h-8 w-48 animate-pulse rounded bg-gray-200" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="w-64 flex-shrink-0 space-y-3">
            <div className="h-64 animate-pulse rounded-lg bg-gray-200" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ContactSidebarSkeleton() {
  return (
    <div className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-2 pr-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
      ))}
    </div>
  );
}

// Purely decorative animations — no visual placeholder needed while JS loads.
function DecorationPlaceholder() {
  return null;
}

// Featured products and testimonials are server-rendered: the home page is static and they carry
// its main content (featured cards arrive as initialProducts from the catalog snapshot). Browser
// APIs inside them run in effects. `ssr: false` here shipped skeletons in the static HTML.
const FeaturedProducts = dynamic(() => import("./featured-products"), {
  loading: () => <ProductSkeleton />,
});
const LovedByParents = dynamic(() => import("./loved-by-parents"), {
  loading: () => <ProductSkeleton />,
});

// Decorations and the contact sidebar are non-content client-only extras.
const SnowflakeDecoration = dynamic(() => import("./SnowflakeDecoration"), {
  ssr: false,
  loading: () => <DecorationPlaceholder />,
});
const GingerbreadDecoration = dynamic(() => import("./GingerbreadDecoration"), {
  ssr: false,
  loading: () => <DecorationPlaceholder />,
});
const ContactSidebar = dynamic(() => import("./ContactSidebar"), {
  ssr: false,
  loading: () => <ContactSidebarSkeleton />,
});

const ScrollReveal = dynamic(() => import("./ScrollReveal"));

// SSR kept for content sections — they render static HTML and benefit from SEO/initial paint
const NewbornGiftingSection = dynamic(() => import("./newborn-gifting-section"));
const SustainabilitySection = dynamic(() => import("./sustainability-section"));
const WhyMuslinSection = dynamic(() => import("./why-muslin-section"));

export {
  FeaturedProducts,
  LovedByParents,
  SnowflakeDecoration,
  GingerbreadDecoration,
  ContactSidebar,
  NewbornGiftingSection,
  SustainabilitySection,
  WhyMuslinSection,
  ScrollReveal,
};
