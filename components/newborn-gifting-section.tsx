"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import SnowflakeDecoration from "@/components/SnowflakeDecoration";
import image1 from "@/assets/image.png";
import image2 from "@/assets/image2.png";

export default function NewbornGiftingSection() {
  return (
    <section className="lg:py-28 py-20 bg-[#f9f7f4] relative overflow-hidden">
      <SnowflakeDecoration
        position="top-left"
        size="md"
        opacity={0.12}
        rotation={-20}
        animationType="up-down"
        delay={0.5}
      />
      <SnowflakeDecoration
        position="bottom-right"
        size="lg"
        opacity={0.1}
        rotation={30}
        animationType="diagonal"
        delay={1.8}
      />

      <div className="w-full relative z-10">
        <div className="text-center mb-16 px-4">
          <h2 className="text-2xl md:text-3xl font-light mb-4">
            New Born Gifting
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Perfect gifts for the newest little ones. Curated essential kits
            that every newborn needs for comfort and care.
          </p>
        </div>

        {/* Mobile Layout - 2 Cards + Button */}
        <div className="w-full px-4 lg:hidden">
          <div className="flex flex-col gap-4">
            {/* Card 1 */}
            <div className="w-full h-[200px]">
              <Link href="/products?category=newborn-essentials">
                <div className="group cursor-pointer h-full">
                  <div
                    className="relative overflow-hidden rounded-lg bg-cover bg-center bg-no-repeat h-full"
                    style={{
                      backgroundImage:
                        `url(${image1.src})`,
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

                    {/* Overlay content */}
                    <div className="absolute inset-0 flex items-end justify-center p-6">
                      <div className="text-center text-white">
                        <h3 className="text-xl font-light mb-2">
                          Essential Kits
                        </h3>
                        <p className="text-sm opacity-90">
                          Everything your little one needs
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </div>

            {/* Card 2 */}
            <div className="w-full h-[200px]">
              <Link href="/products?category=newborn-clothing">
                <div className="group cursor-pointer h-full">
                  <div
                    className="relative overflow-hidden rounded-lg bg-cover bg-center hover:scale-105 transition-all duration-300 bg-no-repeat h-full"
                    style={{
                      backgroundImage:
                        `url(${image2.src})`,                    
                      }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

                    {/* Overlay content */}
                    <div className="absolute inset-0 flex items-end justify-center p-6">
                      <div className="text-center text-white">
                        <h3 className="text-xl font-light mb-2">
                          Soft Clothing
                        </h3>
                        <p className="text-sm opacity-90">
                          Gentle fabrics for delicate skin
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </div>

            {/* View All Button */}
            <div className="w-full">
              <Link href="/products?age=0-3-months">
                <Button
                  variant="outline"
                  className="w-full h-12 text-sm hover:bg-primary hover:text-primary-foreground transition-colors duration-300"
                >
                  View All Newborn Products
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Desktop Layout - 2 Cards */}
        <div className="w-full px-16 hidden lg:block">
          <div className="flex flex-row gap-6 h-[400px]">
            {/* Card 1 - Essential Kits */}
            <div className="w-1/2 h-full">
              <Link href="/products?category=newborn-essentials">
                <div className="group cursor-pointer h-full">
                  <div
                    className="relative overflow-hidden rounded-lg bg-cover bg-center bg-no-repeat h-full"
                    style={{
                      backgroundImage:
                        `url(${image1.src})`,
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent group-hover:bg-black/40 transition-all duration-500" />

                    {/* Overlay content */}
                    <div className="absolute inset-0 flex items-end justify-center p-6">
                      <div className="text-center text-white">
                        <h3 className="text-xl md:text-2xl font-light mb-2">
                          Essential Kits
                        </h3>
                        <p className="text-sm md:text-base opacity-90">
                          Everything your little one needs
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </div>

            {/* Card 2 - Soft Clothing */}
            <div className="w-1/2 h-full">
              <Link href="/products?category=newborn-clothing">
                <div className="group cursor-pointer h-full">
                  <div
                    className="relative overflow-hidden rounded-lg bg-cover bg-center bg-no-repeat h-full"
                    style={{
                      backgroundImage:
                        `url(${image2.src})`,
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent group-hover:bg-black/40 transition-all duration-500" />

                    {/* Overlay content */}
                    <div className="absolute inset-0 flex items-end justify-center p-6">
                      <div className="text-center text-white">
                        <h3 className="text-xl md:text-2xl font-light mb-2">
                          Soft Clothing
                        </h3>
                        <p className="text-sm md:text-base opacity-90">
                          Gentle fabrics for delicate skin
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
