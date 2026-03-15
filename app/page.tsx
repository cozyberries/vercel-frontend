import Hero from "@/components/hero";
import EarlyBirdBanner from "@/components/early-bird-banner";
import CategoryGrid from "@/components/category-grid";
import AgeGrid from "@/components/age-grid";
import {
  FeaturedProducts,
  SnowflakeDecoration,
  ContactSidebar,
  NewbornGiftingSection,
  SustainabilitySection,
  WhyMuslinSection,
  ScrollReveal,
} from "@/components/HomeClientSections";

export default function Home() {
  return (
    <div className="flex flex-col">
      <Hero />
      <EarlyBirdBanner />

      {/* Shop by Age */}
      <section className="lg:py-14 py-8 bg-[#f9f7f4] relative overflow-hidden">
        <SnowflakeDecoration
          position="top-left"
          size="lg"
          opacity={0.15}
          rotation={-15}
          animationType="up-down"
          delay={0}
        />
        <SnowflakeDecoration
          position="top-right"
          size="md"
          opacity={0.12}
          rotation={25}
          animationType="left-right"
          delay={1}
        />
        <SnowflakeDecoration
          position="bottom-left"
          size="sm"
          opacity={0.1}
          rotation={45}
          animationType="diagonal"
          delay={2}
        />
        <ScrollReveal className="container mx-auto px-4 relative z-10">
          <h2 className="text-2xl md:text-3xl font-light text-center mb-6 md:mb-10">
            Shop by Age
          </h2>
          <AgeGrid />
        </ScrollReveal>
      </section>

      {/* Category Grid */}
      <section className="lg:py-14 py-8 bg-background">
        <ScrollReveal className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-light text-center mb-6 md:mb-10">
            Shop by Category
          </h2>
          <CategoryGrid />
        </ScrollReveal>
      </section>

      {/* New Born Gifting */}
      <NewbornGiftingSection />

      {/* Featured Products */}
      <section className="lg:py-14 py-8 bg-background relative overflow-hidden">
        <SnowflakeDecoration
          position="top-right"
          size="lg"
          opacity={0.14}
          rotation={-30}
          animationType="vertical-float"
          delay={0.5}
        />
        <SnowflakeDecoration
          position="bottom-right"
          size="md"
          opacity={0.11}
          rotation={60}
          animationType="left-right"
          delay={1.5}
        />
        <SnowflakeDecoration
          position="center"
          size="sm"
          opacity={0.08}
          rotation={-45}
          animationType="gentle-sway"
          delay={3}
        />
        <ScrollReveal className="container mx-auto px-4 relative z-10">
          <h2 className="text-2xl md:text-3xl font-light text-center mb-6 md:mb-10">
            Our Featured Products
          </h2>
          <FeaturedProducts />
        </ScrollReveal>
      </section>

      {/* Sustainability */}
      <SustainabilitySection />

      {/* Why Muslin */}
      <WhyMuslinSection />

      {/* Contact Sidebar */}
      <ContactSidebar />
    </div>
  );
}
