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

export default function Home() {
  return (
    <div className="flex flex-col">
      <PromoPill />
      <Hero />

      {/* Shop by Age */}
      <section className="lg:py-14 py-8 bg-cb-linen">
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
          <FeaturedProducts />
        </ScrollReveal>
      </section>

      {/* Category Grid */}
      <section className="lg:py-14 py-8 bg-background">
        <ScrollReveal className="container mx-auto px-4">
          <h2 className="text-[21px] md:text-[26px] font-light mb-4 md:mb-8">
            Shop by Category
          </h2>
          <CategoryGrid />
        </ScrollReveal>
      </section>

      {/* New Born Gifting */}
      <NewbornGiftingSection />

      {/* Comfort Meets Conscious Living */}
      <ValuesSection />

      {/* Loved by Parents */}
      <LovedByParents />

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
