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
        <div className="max-w-3xl mx-auto">
          <div className="relative w-full h-[200px] md:h-[260px] overflow-hidden rounded-2xl mb-6 shadow-sm">
            <Image
              src={images.heroImages[1]}
              alt="Sustainable baby clothing and eco-friendly practices"
              fill
              sizes="(max-width: 1024px) 100vw, 768px"
              loading="lazy"
              className="object-cover"
              onError={(e) => {
                e.currentTarget.src = "/placeholder.jpg";
              }}
            />
          </div>

          <h3 className="text-2xl md:text-3xl font-light mb-3">
            Our Commitment to Sustainability
          </h3>
          <p className="text-muted-foreground mb-3">
            We believe thoughtful design begins with responsible choices.
            From materials to production, we aim to create pieces that
            are kinder to both little ones and the environment.
          </p>
          <ul className="text-foreground space-y-1 mb-3 list-none">
            <li>— Conscious material choices</li>
            <li>— Responsible production practices</li>
            <li>— Mindfully produced in small batches</li>
          </ul>
          <p className="text-muted-foreground italic mb-6">
            Designed with longevity in mind.
          </p>

          <div className="grid grid-cols-3 gap-3 md:gap-6">
            {sustainabilityCards.map((card, index) => (
              <div
                key={index}
                className="bg-cb-linen border border-cb-border rounded-xl p-4 md:p-6 flex flex-col items-center justify-center text-center gap-2"
              >
                <div
                  className="w-6 h-6 md:w-7 md:h-7"
                  style={{
                    maskImage: `url(${card.icon})`,
                    maskSize: "contain",
                    maskRepeat: "no-repeat",
                    maskPosition: "center",
                    backgroundColor: "var(--cb-mauve-deep)",
                  }}
                />
                <h4 className="text-xs md:text-sm font-semibold text-cb-fg">
                  {card.title}
                </h4>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
