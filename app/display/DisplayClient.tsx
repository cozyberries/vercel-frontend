"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EmptySlide from "@/components/display/EmptySlide";
import Slide from "@/components/display/Slide";
import { useCatalog } from "@/hooks/useCatalog";
import type { Snapshot } from "@/lib/catalog/types";
import modelPhotoTags from "@/lib/display/model-photos.json";
import { createPhotoCache, type PhotoCache } from "@/lib/display/photo-cache";
import { FADE_MS, PHOTO_RETRY_MS, SLIDE_MS, msUntilNextReload } from "@/lib/display/schedule";
import { nextCycle } from "@/lib/display/shuffle";
import { selectSlides, type DisplaySlide, type ModelPhotoTags } from "@/lib/display/slides";

/** Set on the first tap so reloads (deploys, the nightly refresh) resume without another tap. */
export const STARTED_KEY = "display:started";

interface DisplayClientProps {
  snapshot: Snapshot;
  tags?: ModelPhotoTags;
  photoCache?: PhotoCache;
  onReload?: () => void;
  random?: () => number;
}

interface Shown {
  slide: DisplaySlide;
  /** Unique per showing, so a one-slide loop still crossfades onto itself. */
  seq: number;
}

const reloadPage = () => window.location.reload();

function readStarted(): boolean {
  try {
    return localStorage.getItem(STARTED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberStarted(): void {
  try {
    localStorage.setItem(STARTED_KEY, "1");
  } catch {
    // Storage blocked: the loop still plays; it just asks for a tap again after the next reload.
  }
}

/** Fullscreen calls may be missing, return undefined (old WebKit) or reject; none of that may stop the loop. */
function settle(call: () => Promise<void> | undefined): void {
  try {
    const pending = call();
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
  } catch {
    // Unsupported: the installed-app manifest keeps the screen chrome-free instead.
  }
}

export default function DisplayClient({
  snapshot,
  tags = modelPhotoTags,
  photoCache,
  onReload = reloadPage,
  random = Math.random,
}: DisplayClientProps) {
  const { data } = useCatalog(snapshot);
  const slides = useMemo(() => selectSlides(data ?? snapshot, tags), [data, snapshot, tags]);
  const photoKey = slides.map((s) => s.photoUrl).join("|");

  const [cache] = useState<PhotoCache>(() => photoCache ?? createPhotoCache());
  const [started, setStarted] = useState(false);
  const [readyTick, setReadyTick] = useState(0);
  const [current, setCurrent] = useState<Shown | null>(null);
  const [previous, setPrevious] = useState<Shown | null>(null);

  const slidesRef = useRef(slides);
  const currentRef = useRef<Shown | null>(null);
  const cycleRef = useRef<{ order: DisplaySlide[]; index: number }>({ order: [], index: 0 });
  const seqRef = useRef(0);

  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);

  const show = useCallback((slide: DisplaySlide | null) => {
    const next = slide ? { slide, seq: ++seqRef.current } : null;
    setPrevious(next ? currentRef.current : null);
    currentRef.current = next;
    setCurrent(next);
  }, []);

  const advance = useCallback(() => {
    // Always read the latest catalog: a product removed mid-cycle is skipped, a changed price is picked up.
    const live = new Map(slidesRef.current.map((s) => [s.slug, s] as const));
    const playable = (slug: string) => {
      const slide = live.get(slug);
      return slide && cache.photoFor(slide.photoUrl) ? slide : null;
    };
    const cycle = cycleRef.current;
    // The rest of this cycle first, then one fresh cycle.
    for (let pass = 0; pass < 2; pass++) {
      while (cycle.index < cycle.order.length) {
        const next = playable(cycle.order[cycle.index++].slug);
        if (next) {
          show(next);
          return;
        }
      }
      cycle.order = nextCycle(slidesRef.current, currentRef.current?.slide.slug ?? null, random);
      cycle.index = 0;
    }
    // Nothing playable: keep the current slide if it is still valid, otherwise show the empty card.
    if (!(currentRef.current && playable(currentRef.current.slide.slug))) show(null);
  }, [cache, random, show]);

  // Auto-resume after a reload.
  useEffect(() => {
    if (readStarted()) setStarted(true);
  }, []);

  // Syncs are queued one behind another so overlapping runs never race on the same cache entries.
  const syncChainRef = useRef<Promise<void>>(Promise.resolve());
  const runSync = useCallback(() => {
    syncChainRef.current = syncChainRef.current
      .then(() => cache.sync(slidesRef.current, () => setReadyTick((t) => t + 1)))
      .catch(() => {});
  }, [cache]);

  // Keep the photo cache in step with the slides; runs before the tap too, so photos download early.
  useEffect(() => {
    runSync();
  }, [runSync, photoKey]);

  // A download that failed (a Wi-Fi blip) is retried when the connection returns, and every few
  // minutes while any photo is still missing, instead of leaving that product out until a reload.
  useEffect(() => {
    const retryIfMissing = () => {
      if (slidesRef.current.some((s) => !cache.photoFor(s.photoUrl))) runSync();
    };
    window.addEventListener("online", runSync);
    const id = setInterval(retryIfMissing, PHOTO_RETRY_MS);
    return () => {
      window.removeEventListener("online", runSync);
      clearInterval(id);
    };
  }, [cache, runSync]);

  // One timer drives the loop while started.
  useEffect(() => {
    if (!started) return;
    advance();
    const id = setInterval(advance, SLIDE_MS);
    return () => clearInterval(id);
  }, [started, advance]);

  // A photo arrived while nothing was on screen: show it now rather than at the next tick.
  useEffect(() => {
    if (started && !currentRef.current) advance();
  }, [started, readyTick, advance]);

  // Unmount the outgoing slide once the crossfade is done.
  useEffect(() => {
    if (!previous) return;
    const id = setTimeout(() => setPrevious(null), FADE_MS);
    return () => clearTimeout(id);
  }, [previous]);

  // Keep the screen awake; browsers drop the lock whenever the page is hidden.
  useEffect(() => {
    if (!started) return;
    let sentinel: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        sentinel = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        // Refused or unsupported: the device's own screen-timeout setting is the backstop.
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void request();
    };
    void request();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      sentinel?.release().catch(() => {});
    };
  }, [started]);

  // Nightly reload picks up new deploys and clears memory; offline displays try again the next night.
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const schedule = () => {
      id = setTimeout(() => (navigator.onLine ? onReload() : schedule()), msUntilNextReload(new Date()));
    };
    schedule();
    return () => clearTimeout(id);
  }, [onReload]);

  const handleTap = () => {
    if (!started) {
      rememberStarted();
      setStarted(true);
      settle(() => document.documentElement.requestFullscreen?.());
      return;
    }
    if (document.fullscreenElement) settle(() => document.exitFullscreen?.());
    else settle(() => document.documentElement.requestFullscreen?.());
  };

  const layers = [previous, current].filter((s): s is Shown => s !== null);

  return (
    <div
      data-testid="display-root"
      onClick={handleTap}
      // touch-none: shoppers poke the tablet; a pinch or double-tap must not leave the loop zoomed in.
      className="fixed inset-0 z-[100] cursor-none touch-none select-none overflow-hidden bg-[#2b1d14]"
    >
      {current === null && <EmptySlide />}
      {layers.map(({ slide, seq }) => {
        const src = cache.photoFor(slide.photoUrl);
        return src ? <Slide key={seq} slide={slide} photoSrc={src} /> : null;
      })}
      {!started && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
          <button
            type="button"
            className="rounded-full bg-[#fffaf4] px-[5vmin] py-[2.5vmin] font-serif text-[max(20px,4vmin)] text-[#4a3426] shadow-2xl"
          >
            Tap to start
          </button>
        </div>
      )}
    </div>
  );
}
