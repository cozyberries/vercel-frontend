import { afterEach, describe, expect, it, vi } from "vitest";
import { getMinPrice } from "@/lib/utils";
import { SUPABASE_PRODUCTS, displayCard, displaySnapshot } from "./__fixtures__/cards";
import { displayUrl, selectSlides, type ModelPhotoTags } from "./slides";

const ORIGIN = "https://cozyberries.in";
const tags: ModelPhotoTags = { checkedAt: "2026-09-25", withBaby: ["a", "b", "c", "d"], withoutBaby: ["flat"] };

afterEach(() => {
  vi.unstubAllEnvs();
});

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
    expect(selectSlides(snapshot, tags, ORIGIN).map((s) => s.slug)).toEqual(["a", "d"]);
  });

  it("uses the first image's detail WebP, keeps the original as fallback, and tags the QR link", () => {
    const [slide] = selectSlides(displaySnapshot([displayCard("a")]), tags, ORIGIN);
    expect(slide).toEqual({
      slug: "a",
      name: "Name a",
      minPrice: 500,
      hasRange: false,
      photoUrl: `${SUPABASE_PRODUCTS}/a/1_detail.webp`,
      fallbackUrl: `${SUPABASE_PRODUCTS}/a/1.jpg`,
      productUrl: "https://cozyberries.in/products/a?utm_source=stall&utm_medium=display",
    });
  });

  it("prices exactly like the /products card (lowest in-stock size, range flag)", () => {
    const sizes = [
      { name: "0-3M", slug: "0-3m", price: 450, stock_quantity: 2, display_order: 1 },
      { name: "3-6M", slug: "3-6m", price: 400, stock_quantity: 0, display_order: 2 },
      { name: "6-12M", slug: "6-12m", price: 600, stock_quantity: 1, display_order: 3 },
    ];
    const [slide] = selectSlides(displaySnapshot([displayCard("a", { sizes })]), tags, ORIGIN);
    expect({ minPrice: slide.minPrice, hasRange: slide.hasRange }).toEqual({ minPrice: 450, hasRange: true });
    const card = getMinPrice({ price: 500, sizes, variants: [] });
    expect({ minPrice: card.min, hasRange: card.hasRange }).toEqual({ minPrice: slide.minPrice, hasRange: slide.hasRange });
  });

  it("returns [] for an empty catalog", () => {
    expect(selectSlides(displaySnapshot([]), tags, ORIGIN)).toEqual([]);
  });

  it("uses one URL for photo and fallback when the first image is not on Supabase", () => {
    const url = "https://res.cloudinary.com/cozy/image/upload/a.jpg";
    const [slide] = selectSlides(displaySnapshot([displayCard("a", { images: [url] })]), tags, ORIGIN);
    expect(slide.photoUrl).toBe(url);
    expect(slide.fallbackUrl).toBe(url);
  });

  it("builds absolute links from NEXT_PUBLIC_SITE_URL by default", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://preview.example.com/");
    const [slide] = selectSlides(displaySnapshot([displayCard("a")]), tags);
    expect(slide.productUrl).toBe("https://preview.example.com/products/a?utm_source=stall&utm_medium=display");
  });
});

describe("displayUrl", () => {
  it("appends the stall UTM tags to paths with and without a query", () => {
    expect(displayUrl("/", ORIGIN)).toBe("https://cozyberries.in/?utm_source=stall&utm_medium=display");
    expect(displayUrl("/products?view=grid", ORIGIN)).toBe(
      "https://cozyberries.in/products?view=grid&utm_source=stall&utm_medium=display",
    );
  });
});
