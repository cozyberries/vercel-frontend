"use client";

import { useState } from "react";
import Marquee from "react-fast-marquee";
export default function PromoBar() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="w-full top-0 left-0 right-0 bg-[#e8e3d7] text-sm py-1 z-50">
      <Marquee
        gradient={false}
        speed={50}
        pauseOnHover={true}
        className="text-headerText"
      >
        <span className="mx-20">
          Limited Time Offer: Use Code &apos;WELCOME15&apos; To Get 15% off
          Site-Wide{" "}
        </span>
        <span className="mx-20">
          Limited Time Offer: Use Code &apos;WELCOME15&apos; To Get 15% off
          Site-Wide{" "}
        </span>
        <span className="mx-20">
          Limited Time Offer: Use Code &apos;WELCOME15&apos; To Get 15% off
          Site-Wide{" "}
        </span>
      </Marquee>
    </div>
  );
}
