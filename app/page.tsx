import PromoBar from "@/components/promo-bar";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import Hero from "@/components/hero";
import FeaturedProducts from "@/components/featured-products";
import CategoryGrid from "@/components/category-grid";
import AgeGrid from "@/components/age-grid";
import Newsletter from "@/components/newsletter";

export default function Home() {
  return (
    <div className="flex flex-col">
      <PromoBar />

      <Hero />

      {/* Shop by Age */}
      <section className="py-20 bg-[#f9f7f4]">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-light text-center mb-12">
            Shop by Age
          </h2>
          <AgeGrid />
        </div>
      </section>

      {/* Category Grid */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-light text-center mb-12">
            Shop by Category
          </h2>
          <CategoryGrid />
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-20 bg-[#f9f7f4]">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-light text-center mb-12">
            Our Featured Products
          </h2>
          <FeaturedProducts />
        </div>
      </section>

      {/* Story Section */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4 max-w-4xl text-center">
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
    </div>
  );
}
