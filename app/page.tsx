import Hero from "@/components/hero";
import CategoryGrid from "@/components/category-grid";
import AgeGrid from "@/components/age-grid";
import PromoPill from "@/components/promo-pill";
import ValuesSection from "@/components/values-section";
import ClosingBlurb from "@/components/closing-blurb";
import {
  FeaturedProducts,
  LovedByParents,
  ContactSidebar,
  NewbornGiftingSection,
  SustainabilitySection,
  WhyMuslinSection,
  ScrollReveal,
} from "@/components/HomeClientSections";
import { getSnapshot } from "@/lib/catalog/cache";
import { isCatalogRedisEnabled } from "@/lib/catalog/flags";
import { FEATURED_COUNT, homeProductRows } from "@/lib/catalog/home";
import type { Product } from "@/lib/services/api";

export const revalidate = 604800; // backstop; on-demand via the catalog tag

async function loadHomeData() {
  if (!isCatalogRedisEnabled()) return { featured: undefined, lovedByParents: undefined, categories: undefined };
  const { snapshot } = await getSnapshot();
  // Featured = baby-model best sellers; Loved by Parents = the next best sellers, never the same cards.
  const rows = homeProductRows(snapshot.products, { featured: FEATURED_COUNT, lovedByParents: 5 });
  const featured = rows.featured as unknown as Product[];
  const lovedByParents = rows.lovedByParents as unknown as Product[];
  const categories = snapshot.reference.categories.map((c) => ({
    id: c.slug,
    slug: c.slug,
    name: c.name,
    image: c.image ?? undefined,
    images: c.image ? [{ url: c.image }] : [],
    display: c.display,
  }));
  return { featured, lovedByParents, categories };
}

export default async function Home() {
  const { featured, lovedByParents, categories } = await loadHomeData();
  return (
    <div className="flex flex-col">
      <PromoPill />
      <Hero />

      {/* Shop by Age */}
      <section className="lg:py-14 py-8">
        <ScrollReveal className="container mx-auto px-4">
          <h2 className="text-[21px] md:text-[26px] font-light mb-4 md:mb-8">
            Shop by Age
          </h2>
          <AgeGrid />
        </ScrollReveal>
      </section>

      {/* Featured Products */}
      <section className="lg:py-14 py-8 bg-background">
        <ScrollReveal>
          <FeaturedProducts initialProducts={featured} />
        </ScrollReveal>
      </section>

      {/* Category Grid */}
      <section className="lg:py-14 py-8 bg-background">
        <ScrollReveal className="container mx-auto px-4">
          <h2 className="text-[21px] md:text-[26px] font-light mb-4 md:mb-8">
            Shop by Category
          </h2>
          <CategoryGrid initialCategories={categories} />
        </ScrollReveal>
      </section>

      {/* New Born Gifting */}
      <NewbornGiftingSection />

      {/* Comfort Meets Conscious Living */}
      <ValuesSection />

      {/* Loved by Parents */}
      <LovedByParents initialProducts={lovedByParents} />

      {/* Sustainability */}
      <SustainabilitySection />

      {/* Why Muslin */}
      <WhyMuslinSection />

      <ClosingBlurb />

      {/* Contact Sidebar */}
      <ContactSidebar />
    </div>
  );
}
