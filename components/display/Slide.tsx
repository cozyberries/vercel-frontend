import type { DisplaySlide } from "@/lib/display/slides";

interface SlideProps {
  slide: DisplaySlide;
  /** Object URL from the display photo cache. */
  photoSrc: string;
}

/** Layout B: the photo framed on a blurred copy of itself, with a floating name card. */
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
        <div className="rounded-2xl bg-[rgba(255,250,244,0.92)] p-[3vmin] text-[#4a3426] shadow-xl landscape:w-[min(36vw,60vh)] portrait:w-[min(88vw,62vh)]">
          <p className="text-[max(12px,1.6vmin)] font-semibold uppercase tracking-[0.18em] text-[#8a6a52]">
            CozyBerries
          </p>
          <h2 className="mt-[1.5vmin] font-serif text-[max(18px,4vmin)] leading-tight">{slide.name}</h2>
        </div>
      </div>
    </div>
  );
}
