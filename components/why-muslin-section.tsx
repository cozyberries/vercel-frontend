"use client";

import { useState } from "react";
import Image from "next/image";
import SnowflakeDecoration from "@/components/SnowflakeDecoration";
import { images } from "@/app/assets/images";

const features = [
  "Breathable fabric that allows natural airflow, helping regulate baby's body temperature",
  "Helps keep babies cool and comfortable throughout the day",
  "Lightweight and easy for daily wear",
  "Soft texture that becomes gentler with every wash",
];

export default function WhyMuslinSection() {
  const [imageSrc, setImageSrc] = useState(images.heroImages[2]);
  return (
    <section className="lg:py-14 py-8 bg-[#f9f7f4] relative overflow-hidden">
      <SnowflakeDecoration
        position="top-left"
        size="lg"
        opacity={0.1}
        rotation={-20}
        animationType="up-down"
        delay={0.4}
      />
      <SnowflakeDecoration
        position="bottom-right"
        size="md"
        opacity={0.12}
        rotation={30}
        animationType="left-right"
        delay={1.4}
      />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-3xl mx-auto">
          <h3 className="text-2xl md:text-3xl font-light mb-3">
            Why Muslin
          </h3>
          <p className="text-muted-foreground mb-4">
            Muslin has long been chosen for baby essentials because of its
            naturally gentle nature and airy structure. The fabric drapes
            softly, feels light on delicate skin, and allows little ones
            to stay comfortable through sleep, play, and cuddles.
          </p>
          <ul className="space-y-3 mb-6">
            {features.map((feature, index) => (
              <li key={index} className="flex items-start gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-cb-mauve-deep" />
                <span className="text-muted-foreground">{feature}</span>
              </li>
            ))}
          </ul>
          <div className="relative w-full h-[200px] md:h-[260px] overflow-hidden rounded-2xl shadow-sm">
            <Image
              src={imageSrc}
              alt="Soft muslin baby clothing"
              fill
              sizes="(max-width: 1024px) 100vw, 768px"
              loading="lazy"
              className="object-cover"
              onError={() => setImageSrc("/placeholder.jpg")}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
