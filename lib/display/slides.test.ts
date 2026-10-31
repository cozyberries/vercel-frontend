import { describe, expect, it } from "vitest";
import { SUPABASE_PRODUCTS, displayCard, displaySnapshot } from "./__fixtures__/cards";
import { selectSlides, type ModelPhotoTags } from "./slides";

const tags: ModelPhotoTags = { checkedAt: "2026-09-25", withBaby: ["a", "b", "c", "d"], withoutBaby: ["flat"] };

describe("selectSlides", () => {
  it("keeps in-stock products tagged withBaby that have an image, in snapshot order", () => {
    const snapshot = displaySnapshot([
      displayCard("a"),
      displayCard("flat"),
      displayCard("b", { in_stock: false }),
      displayCard("c", { images: [] }),
      displayCard("untagged"),
      displayCard("d"),
    ]);
    expect(selectSlides(snapshot, tags).map((s) => s.slug)).toEqual(["a", "d"]);
  });

  it("uses the first image's detail WebP and keeps the original as fallback; no price or link", () => {
    const [slide] = selectSlides(displaySnapshot([displayCard("a")]), tags);
    expect(slide).toEqual({
      slug: "a",
      name: "Name a",
      photoUrl: `${SUPABASE_PRODUCTS}/a/1_detail.webp`,
      fallbackUrl: `${SUPABASE_PRODUCTS}/a/1.jpg`,
    });
  });

  it("returns [] for an empty catalog", () => {
    expect(selectSlides(displaySnapshot([]), tags)).toEqual([]);
  });

  it("uses one URL for photo and fallback when the first image is not on Supabase", () => {
    const url = "https://res.cloudinary.com/cozy/image/upload/a.jpg";
    const [slide] = selectSlides(displaySnapshot([displayCard("a", { images: [url] })]), tags);
    expect(slide.photoUrl).toBe(url);
    expect(slide.fallbackUrl).toBe(url);
  });
});
