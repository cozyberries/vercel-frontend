import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import PromoBar from "@/components/promo-bar"
import FeaturedProducts from "@/components/featured-products"
import CategoryGrid from "@/components/category-grid"
import Newsletter from "@/components/newsletter"

export default function Home() {
  return (
    <div className="flex flex-col">
      <PromoBar />

      {/* Hero Section */}
      <section className="relative h-[500px] md:h-[600px] bg-[#f5eee0] overflow-hidden">
        <div className="container mx-auto px-4 h-full flex items-center">
          <div className="max-w-xl z-10">
            <h1 className="text-3xl md:text-5xl font-light mb-4">Adorable Clothing for Your Little Treasures</h1>
            <p className="text-lg mb-8 text-muted-foreground">
              Crafted with love, designed for comfort, and made to last
            </p>
            <div className="flex gap-4">
              <Button asChild size="lg">
                <Link href="/collections/new-arrivals">Shop New Arrivals</Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/collections/bestsellers">Bestsellers</Link>
              </Button>
            </div>
          </div>
          <div className="absolute right-0 bottom-0 w-1/2 h-full hidden md:block">
            <Image
              src="/placeholder.svg?height=600&width=600"
              alt="Baby clothing collection"
              width={600}
              height={600}
              className="object-cover"
              priority
            />
          </div>
        </div>
      </section>

      {/* Category Grid */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-light text-center mb-12">Shop by Category</h2>
          <CategoryGrid />
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-16 bg-[#f9f7f4]">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-light text-center mb-12">Our Bestsellers</h2>
          <FeaturedProducts />
        </div>
      </section>

      {/* Story Section */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <h2 className="text-2xl md:text-3xl font-light mb-6">Our Story</h2>
          <p className="text-lg text-muted-foreground mb-8">
            At TinyTreasures, we believe that every baby deserves to be wrapped in comfort and style. Our clothing is
            crafted from premium organic materials, ensuring that your little one experiences nothing but the softest
            touch against their delicate skin.
          </p>
          <Button variant="outline" asChild>
            <Link href="/about">Learn More</Link>
          </Button>
        </div>
      </section>

      {/* Newsletter */}
      <Newsletter />
    </div>
  )
}

