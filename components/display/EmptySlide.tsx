import { displayUrl } from "@/lib/display/slides";
import Qr from "./Qr";

/** Shown when no product qualifies, or before the first photo is ready. */
export default function EmptySlide() {
  return (
    <div
      data-testid="display-empty"
      className="absolute inset-0 flex flex-col items-center justify-center gap-[4vmin] bg-[#f6efe6] p-[6vmin] text-center text-[#4a3426]"
    >
      <p className="text-[max(14px,2vmin)] font-semibold uppercase tracking-[0.18em] text-[#8a6a52]">CozyBerries</p>
      <h1 className="font-serif text-[max(22px,6vmin)] leading-tight">Soft muslin for little ones</h1>
      <Qr value={displayUrl("/")} className="w-[min(30vw,30vh)]" />
      <p className="text-[max(14px,2.6vmin)]">Scan to shop</p>
    </div>
  );
}
