// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "@/lib/catalog/types";
import { SUPABASE_PRODUCTS, displayCard, displaySnapshot } from "@/lib/display/__fixtures__/cards";
import type { PhotoCache, PhotoSource } from "@/lib/display/photo-cache";
import { FADE_MS, SLIDE_MS } from "@/lib/display/schedule";
import type { ModelPhotoTags } from "@/lib/display/slides";

// useCatalog returns the server snapshot unless a test simulates a background refresh.
const catalog = vi.hoisted(() => ({ override: null as Snapshot | null }));
vi.mock("@/hooks/useCatalog", () => ({
  useCatalog: (initial: Snapshot) => ({ data: catalog.override ?? initial }),
}));
vi.mock("@/components/display/Qr", () => ({
  default: ({ value }: { value: string }) => <div data-testid="qr" data-value={value} />,
}));

import DisplayClient, { STARTED_KEY } from "./DisplayClient";

const tags: ModelPhotoTags = { checkedAt: "2026-09-25", withBaby: ["a", "b", "c"], withoutBaby: [] };
const snapshot = displaySnapshot([displayCard("a"), displayCard("b"), displayCard("c")]);
/** random() ≈ 1 makes Fisher–Yates keep snapshot order, so every cycle plays a, b, c. */
const inOrder = () => 0.999;
const photoOf = (slug: string) => `${SUPABASE_PRODUCTS}/${slug}/1_detail.webp`;

function fakePhotoCache(readySlugs: string[]) {
  const ready = new Set(readySlugs.map(photoOf));
  let notify: ((photoUrl: string) => void) | undefined;
  const cache: PhotoCache & { markReady(slug: string): void } = {
    sync: vi.fn(async (slides: readonly PhotoSource[], onReady?: (photoUrl: string) => void) => {
      notify = onReady;
      for (const s of slides) if (ready.has(s.photoUrl)) onReady?.(s.photoUrl);
    }),
    photoFor: (photoUrl) => (ready.has(photoUrl) ? `blob:${photoUrl}` : null),
    markReady(slug) {
      ready.add(photoOf(slug));
      notify?.(photoOf(slug));
    },
  };
  return cache;
}

function renderDisplay(props: Partial<ComponentProps<typeof DisplayClient>> = {}) {
  const photoCache = props.photoCache ?? fakePhotoCache(["a", "b", "c"]);
  const onReload = props.onReload ?? vi.fn();
  const view = render(
    <DisplayClient snapshot={snapshot} tags={tags} random={inOrder} {...props} photoCache={photoCache} onReload={onReload} />,
  );
  return { ...view, photoCache, onReload };
}

/** Slug of the slide on top (the current one is rendered last). */
const shownSlug = () => screen.queryAllByTestId("display-slide").at(-1)?.getAttribute("data-slug") ?? null;
const tick = (ms: number) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms);
});
const tap = () => fireEvent.click(screen.getByTestId("display-root"));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 25, 12, 0, 0));
  localStorage.clear();
  catalog.override = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (document.documentElement as { requestFullscreen?: unknown }).requestFullscreen;
  delete (navigator as { wakeLock?: unknown }).wakeLock;
});

describe("DisplayClient", () => {
  it("waits for a tap on first run, then plays and remembers it was started", async () => {
    renderDisplay();
    await tick(0);
    expect(screen.getByRole("button", { name: "Tap to start" })).toBeInTheDocument();
    expect(shownSlug()).toBeNull();
    tap();
    await tick(0);
    expect(screen.queryByRole("button", { name: "Tap to start" })).not.toBeInTheDocument();
    expect(shownSlug()).toBe("a");
    expect(localStorage.getItem(STARTED_KEY)).toBe("1");
  });

  it("resumes on its own after a reload", async () => {
    localStorage.setItem(STARTED_KEY, "1");
    renderDisplay();
    await tick(0);
    expect(screen.queryByRole("button", { name: "Tap to start" })).not.toBeInTheDocument();
    expect(shownSlug()).toBe("a");
  });

  it("advances every 7 seconds and starts a new cycle after the last slide", async () => {
    localStorage.setItem(STARTED_KEY, "1");
    renderDisplay();
    await tick(0);
    const seen = [shownSlug()];
    for (let i = 0; i < 3; i++) {
      await tick(SLIDE_MS);
      seen.push(shownSlug());
    }
    expect(seen).toEqual(["a", "b", "c", "a"]);
  });

  it("keeps at most two slides mounted and drops the old one after the crossfade", async () => {
    localStorage.setItem(STARTED_KEY, "1");
    renderDisplay();
    await tick(0);
    await tick(SLIDE_MS);
    expect(screen.getAllByTestId("display-slide")).toHaveLength(2);
    await tick(FADE_MS);
    expect(screen.getAllByTestId("display-slide")).toHaveLength(1);
  });

  it("keeps cycling when only one product qualifies", async () => {
    localStorage.setItem(STARTED_KEY, "1");
    renderDisplay({ tags: { ...tags, withBaby: ["a"] } });
    await tick(0);
    expect(shownSlug()).toBe("a");
    await tick(SLIDE_MS);
    // Crossfades onto itself: two mounted copies with distinct keys, no empty card.
    expect(screen.getAllByTestId("display-slide").map((el) => el.getAttribute("data-slug"))).toEqual(["a", "a"]);
    expect(screen.queryByTestId("display-empty")).not.toBeInTheDocument();
  });

  it("skips slides whose photo is not cached", async () => {
    localStorage.setItem(STARTED_KEY, "1");
    renderDisplay({ photoCache: fakePhotoCache(["a", "c"]) });
    await tick(0);
    expect(shownSlug()).toBe("a");
    await tick(SLIDE_MS);
    expect(shownSlug()).toBe("c");
  });

  it("shows the Scan to shop card when no product qualifies", async () => {
    localStorage.setItem(STARTED_KEY, "1");
    renderDisplay({ tags: { ...tags, withBaby: [] } });
    await tick(0);
    expect(screen.getByTestId("display-empty")).toBeInTheDocument();
    expect(screen.getByTestId("qr").getAttribute("data-value")).toMatch(/\/\?utm_source=stall&utm_medium=display$/);
  });

  it("starts playing as soon as the first photo arrives", async () => {
    localStorage.setItem(STARTED_KEY, "1");
    const photoCache = fakePhotoCache([]);
    renderDisplay({ photoCache });
    await tick(0);
    expect(screen.getByTestId("display-empty")).toBeInTheDocument();
    await act(async () => photoCache.markReady("b"));
    expect(shownSlug()).toBe("b");
  });

  it("never shows a product again once a catalog refresh removes it", async () => {
    localStorage.setItem(STARTED_KEY, "1");
    const { rerender, photoCache, onReload } = renderDisplay();
    await tick(0);
    expect(shownSlug()).toBe("a");
    catalog.override = displaySnapshot([displayCard("a"), displayCard("b", { in_stock: false }), displayCard("c")], "v2");
    rerender(<DisplayClient snapshot={snapshot} tags={tags} random={inOrder} photoCache={photoCache} onReload={onReload} />);
    await tick(SLIDE_MS);
    expect(shownSlug()).toBe("c");
  });

  it("still starts when localStorage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderDisplay();
    await tick(0);
    tap();
    await tick(0);
    expect(shownSlug()).toBe("a");
  });

  it("starts when fullscreen and wake lock do not exist", async () => {
    renderDisplay(); // jsdom implements neither API
    await tick(0);
    tap();
    await tick(0);
    expect(shownSlug()).toBe("a");
  });

  it("starts when fullscreen and wake lock reject", async () => {
    const requestFullscreen = vi.fn(() => Promise.reject(new Error("denied")));
    Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: requestFullscreen });
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request: vi.fn(() => Promise.reject(new Error("denied"))) },
    });
    renderDisplay();
    await tick(0);
    tap();
    await tick(0);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(shownSlug()).toBe("a");
  });

  it("re-requests fullscreen on a tap after an auto-resume", async () => {
    const requestFullscreen = vi.fn(async () => {});
    Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: requestFullscreen });
    localStorage.setItem(STARTED_KEY, "1");
    renderDisplay();
    await tick(0);
    tap();
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("re-requests the wake lock whenever the page becomes visible again", async () => {
    const request = vi.fn(async () => ({ release: vi.fn(async () => {}) }));
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request } });
    localStorage.setItem(STARTED_KEY, "1");
    renderDisplay();
    await tick(0);
    expect(request).toHaveBeenCalledTimes(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("reloads at 4 am only when online, otherwise tries again the next day", async () => {
    vi.setSystemTime(new Date(2026, 8, 25, 3, 59, 0));
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { onReload } = renderDisplay();
    await tick(60_000);
    expect(onReload).not.toHaveBeenCalled();
    online.mockReturnValue(true);
    await tick(24 * 60 * 60 * 1000);
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
