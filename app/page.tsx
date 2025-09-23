import PromoBar from "@/components/promo-bar";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import Hero from "@/components/hero";
import FeaturedProducts from "@/components/featured-products";
import CategoryGrid from "@/components/category-grid";
import AgeGrid from "@/components/age-grid";
import Newsletter from "@/components/newsletter";
import SnowflakeDecoration from "@/components/SnowflakeDecoration";
import ContactSidebar from "@/components/ContactSidebar";

export default function Home() {
  return (
    <div className="flex flex-col">
      <PromoBar />

      <Hero />

      {/* Shop by Age */}
      <section className="lg:py-28 py-20 bg-[#f9f7f4] relative overflow-hidden">
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
        <div className="container mx-auto px-4 relative z-10">
          <h2 className="text-2xl md:text-3xl font-light text-center mb-16">
            Shop by Age
          </h2>
          <AgeGrid />
        </div>
      </section>

      {/* Category Grid */}
      <section className="lg:py-28 py-20 bg-background">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-light text-center mb-16">
            Shop by Category
          </h2>
          <CategoryGrid />
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-28 bg-[#f9f7f4] relative overflow-hidden">
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
        <div className="container mx-auto px-4 relative z-10">
          <h2 className="text-2xl md:text-3xl font-light text-center mb-16">
            Our Featured Products
          </h2>
          <FeaturedProducts />
        </div>
      </section>

      {/* Story Section */}
      <section className="lg:py-28 py-20 bg-background relative overflow-hidden">
        <SnowflakeDecoration
          position="top-left"
          size="md"
          opacity={0.13}
          rotation={20}
          animationType="up-down"
          delay={0.8}
        />
        <SnowflakeDecoration
          position="bottom-right"
          size="lg"
          opacity={0.1}
          rotation={-25}
          animationType="diagonal"
          delay={2.2}
        />
        <div className="container mx-auto px-4 max-w-4xl text-center relative z-10">
          <h2 className="text-2xl md:text-3xl font-light mb-6">Our Story</h2>
          <p className="text-lg text-muted-foreground mb-8">
            At Cozyberries, we believe that every baby deserves to be wrapped in
            comfort and style. Our clothing is crafted from premium organic
            materials, ensuring that your little one experiences nothing but the
            softest touch against their delicate skin.
          </p>
          <Button variant="outline" asChild>
            <Link href="/about">Learn More</Link>
          </Button>
        </div>
      </section>

      {/* Newsletter */}
      <Newsletter />
      
      {/* Contact Sidebar */}
      <ContactSidebar />
    </div>
  );
}
