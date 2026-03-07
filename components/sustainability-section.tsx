"use client";

import Image from "next/image";
import SnowflakeDecoration from "@/components/SnowflakeDecoration";
import { images } from "@/app/assets/images";

export default function SustainabilitySection() {
  const sustainabilityCards = [
    {
      icon: images.svgs.eco_friendly,
      title: "100% Organic Cotton",
    },
    {
      icon: images.svgs.garden_green_house,
      title: "Made in India with Love",
    },
    {
      icon: images.svgs.sprout_tree,
      title: "Ethical Production",
    },
  ];

  return (
    <section className="lg:py-14 py-8 bg-background relative overflow-hidden">
      <SnowflakeDecoration
        position="top-right"
        size="lg"
        opacity={0.1}
        rotation={45}
        animationType="diagonal"
        delay={0.3}
      />
      <SnowflakeDecoration
        position="bottom-left"
        size="md"
        opacity={0.12}
        rotation={-30}
        animationType="up-down"
        delay={1.2}
      />

      <div className="container mx-auto px-4 relative z-10">
        {/* Main Content Layout: 40% Image, 50% Content */}
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-10 gap-8 lg:gap-12 items-stretch">
            {/* Image Section - 40% width */}
            <div className="lg:col-span-4 flex">
              <div className="relative w-full min-h-[240px] lg:min-h-0 overflow-hidden rounded-lg">
                <Image
                  src={images.heroImages[1]}
                  alt="Sustainable baby clothing and eco-friendly practices"
                  fill
                  sizes="(max-width: 1024px) 100vw, 40vw"
                  className="object-cover"
                  onError={(e) => {
                    e.currentTarget.src = "/placeholder.jpg";
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
              </div>
            </div>

            {/* Content Section - 50% width */}
            <div className="lg:col-span-6">
              <div className="space-y-8">
                <div>
                  <h3 className="text-2xl md:text-3xl font-light mb-4">
                    Our Commitment to Sustainability
                  </h3>
                  <p className="text-lg text-muted-foreground mb-3">
                    We believe thoughtful design begins with responsible choices.
                    From materials to production, we aim to create pieces that
                    are kinder to both little ones and the environment.
                  </p>
                  <ul className="text-muted-foreground space-y-1 mb-4 list-none">
                    <li>— Conscious material choices</li>
                    <li>— Responsible production practices</li>
                    <li>— Mindfully produced in small batches</li>
                  </ul>
                  <p className="text-muted-foreground italic mb-6">
                    Designed with longevity in mind.
                  </p>
                </div>

                {/* 3 Key Cards */}
                <div className="grid grid-cols-3 gap-3 md:gap-6">
                  {sustainabilityCards.map((card, index) => (
                    <div
                      key={index}
                      className="bg-[#f9f7f4] border border-[#c8c6aa] rounded-xl p-4 md:p-8 hover:scale-105 transition-transform duration-300 flex flex-col items-center justify-center text-center min-h-[160px] md:min-h-[220px]"
                    >
                      <div className="text-[#a2a587] mb-3 md:mb-6">
                        <div className="md:hidden w-8 h-8 flex items-center justify-center">
                          <div
                            className="w-full h-full"
                            style={{
                              maskImage: `url(${card.icon})`,
                              maskSize: "contain",
                              maskRepeat: "no-repeat",
                              maskPosition: "center",
                              backgroundColor: "#a2a587",
                            }}
                          />
                        </div>
                        <div className="hidden md:flex w-[52px] h-[52px] items-center justify-center">
                          <div
                            className="w-full h-full"
                            style={{
                              maskImage: `url(${card.icon})`,
                              maskSize: "contain",
                              maskRepeat: "no-repeat",
                              maskPosition: "center",
                              backgroundColor: "#a2a587",
                            }}
                          />
                        </div>
                      </div>
                      <h4 className="text-sm md:text-lg font-semibold text-[#a2a587]">
                        {card.title}
                      </h4>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
