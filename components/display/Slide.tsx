import type { DisplaySlide } from "@/lib/display/slides";

interface SlideProps {
  slide: DisplaySlide;
  /** Object URL from the display photo cache. */
  photoSrc: string;
}

/** The brand on top, the product name under it, then the photo, all over a blurred copy of the photo. */
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
        className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-[0.6]"
      />
      <div
        data-testid="display-slide-stack"
        className="relative flex h-full w-full flex-col items-center justify-center gap-[2vmin] p-[3vmin] text-center text-[#fffaf4] [text-shadow:0_2px_12px_rgba(0,0,0,0.45)]"
      >
        <div className="w-full max-w-[90vmin] shrink-0">
          <h1 className="font-serif text-[max(22px,5.5vmin)] leading-tight tracking-wide">CozyBerries</h1>
          <h2 className="mt-[1vmin] line-clamp-2 text-[max(16px,3.4vmin)] font-medium leading-snug text-[#f3e6d8]">
            {slide.name}
          </h2>
        </div>
        {/* Whatever the text leaves: the photo is the largest square that fits it (cq units = this box).
            Capped at the padded screen width so a portrait screen keeps text and photo together, centred. */}
        <div
          data-testid="display-photo-area"
          className="flex max-h-[calc(100vw-6vmin)] min-h-0 w-full flex-1 items-center justify-center [container-type:size]"
        >
          <div className="h-[min(100cqw,100cqh)] w-[min(100cqw,100cqh)] overflow-hidden rounded-2xl shadow-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoSrc} alt={slide.name} className="display-zoom h-full w-full object-cover" />
          </div>
        </div>
      </div>
    </div>
  );
}
