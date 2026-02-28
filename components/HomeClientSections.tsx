"use client";

/**
 * Wrapper that holds all below-fold home page sections that need client-only rendering.
 * `ssr: false` is only valid inside Client Components — this wrapper allows us to
 * keep app/page.tsx as a Server Component while still using dynamic imports.
 */
import dynamic from "next/dynamic";

// These sections use browser APIs (IntersectionObserver, animations) or
// fetch client-side, so we exclude them from the server render entirely.
const FeaturedProducts = dynamic(() => import("./featured-products"), { ssr: false });
const SnowflakeDecoration = dynamic(() => import("./SnowflakeDecoration"), { ssr: false });
const GingerbreadDecoration = dynamic(() => import("./GingerbreadDecoration"), { ssr: false });
const ContactSidebar = dynamic(() => import("./ContactSidebar"), { ssr: false });

// SSR kept for content sections — they render static HTML and benefit from SEO/initial paint
const NewbornGiftingSection = dynamic(() => import("./newborn-gifting-section"));
const SustainabilitySection = dynamic(() => import("./sustainability-section"));

export {
  FeaturedProducts,
  SnowflakeDecoration,
  GingerbreadDecoration,
  ContactSidebar,
  NewbornGiftingSection,
  SustainabilitySection,
};
