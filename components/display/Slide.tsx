import DiscountedPrice from "@/components/discounted-price";
import type { DisplaySlide } from "@/lib/display/slides";
import Qr from "./Qr";

interface SlideProps {
  slide: DisplaySlide;
  /** Object URL from the display photo cache. */
  photoSrc: string;
}

/** Layout B: the photo framed on a blurred copy of itself, with a floating details card. */
export default function Slide({ slide, photoSrc }: SlideProps) {
  return (
    <div
      data-testid="display-slide"
      data-slug={slide.slug}
      className="display-fade-in absolute inset-0 overflow-hidden bg-[#2b1d14]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoSrc}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-75"
      />
      <div className="relative flex h-full w-full items-center justify-center gap-[4vmin] p-[4vmin] landscape:flex-row portrait:flex-col">
        <div className="aspect-square shrink-0 overflow-hidden rounded-2xl shadow-2xl landscape:h-[min(88vh,54vw)] portrait:w-[min(88vw,62vh)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoSrc} alt={slide.name} className="display-zoom h-full w-full object-cover" />
        </div>
        <div className="flex rounded-2xl bg-[rgba(255,250,244,0.92)] p-[3vmin] text-[#4a3426] shadow-xl landscape:h-[min(88vh,54vw)] landscape:w-[min(36vw,60vh)] landscape:flex-col landscape:justify-between portrait:w-[min(88vw,62vh)] portrait:flex-row portrait:items-center portrait:gap-[3vmin]">
          <div className="min-w-0 flex-1">
            <p className="text-[max(12px,1.6vmin)] font-semibold uppercase tracking-[0.18em] text-[#8a6a52]">
              CozyBerries
            </p>
            <h2 className="mt-[1.5vmin] font-serif text-[max(18px,4vmin)] leading-tight">{slide.name}</h2>
            <DiscountedPrice
              price={slide.minPrice}
              showStartsAt={slide.hasRange}
              variant="hero"
              className="mt-[1.5vmin]"
            />
          </div>
          <div className="flex items-center gap-[2vmin] landscape:flex-row portrait:flex-col">
            <Qr value={slide.productUrl} className="landscape:w-[min(16vw,28vh)] portrait:w-[min(24vw,18vh)]" />
            <p className="text-[max(12px,2vmin)] leading-snug text-[#6b5443]">
              Scan to order
              <br />
              Pick up at the stall
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
