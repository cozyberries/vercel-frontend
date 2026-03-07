"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import SnowflakeDecoration from "@/components/SnowflakeDecoration";

const ESSENTIAL_KITS_IMAGE =
  "https://res.cloudinary.com/dxokykvty/image/upload/v1772863126/cozyberries/categories/newborn-essentials/3_47f1af.png";

export default function NewbornGiftingSection() {
  const essentialKitsUrl = ESSENTIAL_KITS_IMAGE;

  return (
    <section className="lg:py-14 py-8 bg-[#f9f7f4] relative overflow-hidden">
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
        <div className="text-center mb-6 md:mb-16 px-4">
          <h2 className="text-2xl md:text-3xl font-light mb-4">
            New Born Gifting
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Perfect gifts for the newest little ones. Curated essential kits
            that every newborn needs for comfort and care.
          </p>
        </div>

        {/* Mobile Layout - 1 Card (aspect-square) + Button */}
        <div className="w-full px-4 lg:hidden">
          <div className="flex flex-col gap-4">
            <div className="w-full aspect-square max-w-sm mx-auto">
              <Link href="/products?category=newborn-essentials">
                <div className="group cursor-pointer h-full">
                  <div className="relative overflow-hidden rounded-lg h-full w-full aspect-square">
                    <Image
                      src={essentialKitsUrl}
                      alt="Newborn essential kits"
                      fill
                      sizes="(max-width: 640px) 90vw, 400px"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    <div className="absolute inset-0 flex items-end justify-center p-6">
                      <div className="text-center text-white">
                        <h3 className="text-xl font-light mb-2">Essential Kits</h3>
                        <p className="text-sm opacity-90">Everything your little one needs</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
            <div className="w-full">
              <Link href="/products?age=0-3m">
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

        {/* Desktop Layout - 1 Card (aspect-square) */}
        <div className="w-full px-16 hidden lg:block">
          <div className="max-w-4xl mx-auto">
            <div className="w-full max-w-md aspect-square mx-auto">
              <Link href="/products?category=newborn-essentials">
                <div className="group cursor-pointer h-full">
                  <div className="relative overflow-hidden rounded-lg h-full w-full aspect-square">
                    <Image
                      src={essentialKitsUrl}
                      alt="Newborn essential kits"
                      fill
                      sizes="(max-width: 1024px) 90vw, 448px"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent group-hover:bg-black/40 transition-[background-color] duration-500" />
                    <div className="absolute inset-0 flex items-end justify-center p-6">
                      <div className="text-center text-white">
                        <h3 className="text-xl md:text-2xl font-light mb-2">Essential Kits</h3>
                        <p className="text-sm md:text-base opacity-90">Everything your little one needs</p>
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
