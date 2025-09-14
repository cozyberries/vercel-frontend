import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Heart, Shield, Truck, Users } from "lucide-react";
import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="py-20 bg-gradient-to-b from-[#f9f7f4] to-background">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-light mb-6">
              About CozyBerries
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Crafting comfort and style for your little ones since day one
            </p>
            <div className="relative w-full max-w-2xl mx-auto aspect-video rounded-lg overflow-hidden">
              <Image
                src="/hero/1.webp"
                alt="CozyBerries Story"
                fill
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-light mb-6">Our Story</h2>
                <p className="text-muted-foreground mb-6">
                  CozyBerries was born from a simple belief: every baby deserves 
                  to be wrapped in love, comfort, and the finest materials. As 
                  parents ourselves, we understand the importance of clothing 
                  that's not just beautiful, but safe and comfortable for your 
                  precious little ones.
                </p>
                <p className="text-muted-foreground mb-6">
                  Since our founding, we've been dedicated to creating premium 
                  baby clothing using only organic, sustainable materials. Each 
                  piece is thoughtfully designed and carefully crafted to ensure 
                  your baby experiences nothing but pure comfort.
                </p>
                <p className="text-muted-foreground">
                  From our family to yours, we're honored to be part of your 
                  baby's journey through their most precious early moments.
                </p>
              </div>
              <div className="relative aspect-square rounded-lg overflow-hidden">
                <Image
                  src="/hero/2.jpg"
                  alt="Our Story"
                  fill
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Our Values */}
      <section className="py-20 bg-[#f9f7f4]">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-light text-center mb-12">Our Values</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Heart className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-medium mb-2">Made with Love</h3>
                <p className="text-muted-foreground text-sm">
                  Every piece is crafted with care and attention to detail, 
                  ensuring the highest quality for your little one.
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-medium mb-2">Safe & Organic</h3>
                <p className="text-muted-foreground text-sm">
                  We use only certified organic materials that are gentle 
                  on your baby's delicate skin and safe for the environment.
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Truck className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-medium mb-2">Fast Delivery</h3>
                <p className="text-muted-foreground text-sm">
                  Quick and reliable shipping so your baby can enjoy their 
                  new clothes as soon as possible.
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-medium mb-2">Family First</h3>
                <p className="text-muted-foreground text-sm">
                  We're a family business that understands families, 
                  providing exceptional service and support.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quality Promise */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="relative aspect-square rounded-lg overflow-hidden">
                <Image
                  src="/hero/3.jpg"
                  alt="Quality Promise"
                  fill
                  className="object-cover"
                />
              </div>
              <div>
                <h2 className="text-3xl font-light mb-6">Our Quality Promise</h2>
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center mt-0.5">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                    </div>
                    <div>
                      <h3 className="font-medium mb-1">100% Organic Cotton</h3>
                      <p className="text-sm text-muted-foreground">
                        Certified organic cotton that's soft, breathable, and hypoallergenic.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center mt-0.5">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                    </div>
                    <div>
                      <h3 className="font-medium mb-1">Chemical-Free Dyes</h3>
                      <p className="text-sm text-muted-foreground">
                        Only natural, non-toxic dyes that are safe for sensitive skin.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center mt-0.5">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                    </div>
                    <div>
                      <h3 className="font-medium mb-1">Rigorous Testing</h3>
                      <p className="text-sm text-muted-foreground">
                        Every product undergoes thorough quality and safety testing.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center mt-0.5">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                    </div>
                    <div>
                      <h3 className="font-medium mb-1">Sustainable Practices</h3>
                      <p className="text-sm text-muted-foreground">
                        Eco-friendly packaging and sustainable manufacturing processes.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-20 bg-[#f9f7f4]">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-light mb-6">Ready to Shop?</h2>
            <p className="text-muted-foreground mb-8">
              Discover our collection of premium baby clothing, crafted with 
              love and designed for comfort.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild>
                <Link href="/products">Shop Now</Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/">Back to Home</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
