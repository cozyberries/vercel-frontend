import { describe, expect, it } from "vitest";
import modelPhotos from "../display/model-photos.json";
import { compareListed, featuredCards, hasModelPhoto, type Listed } from "./order";

// 2026-10-10: products whose first photo shows a baby model (lib/display/model-photos.json
// withBaby) lead the default order, and the home Featured row is the best sellers among them.

const BABY = modelPhotos.withBaby[0]!;
const BABY_2 = modelPhotos.withBaby[1]!;
const NO_BABY = modelPhotos.withoutBaby[0]!;
const photo = ["https://img/x.jpg"];

const card = (slug: string, extra: Partial<Listed & { in_stock: boolean }> = {}) => ({
  slug,
  created_at: "2026-01-01T00:00:00.000Z",
  images: photo,
  sales_rank: null as number | null,
  in_stock: true,
  ...extra,
});

describe("hasModelPhoto", () => {
  it("is true only for products tagged withBaby", () => {
    expect(hasModelPhoto(BABY)).toBe(true);
    expect(hasModelPhoto(NO_BABY)).toBe(false);
    expect(hasModelPhoto("never-tagged-product")).toBe(false);
  });
});

describe("compareListed", () => {
  it("puts a baby-model photo ahead of a better seller without one", () => {
    const list = [card(NO_BABY, { sales_rank: 1 }), card("never-tagged-product", { sales_rank: 2 }), card(BABY)];
    expect([...list].sort(compareListed).map((c) => c.slug)).toEqual([BABY, NO_BABY, "never-tagged-product"]);
  });

  it("still puts every product without a photo last, tagged or not", () => {
    const list = [card(BABY, { images: [] }), card(NO_BABY)];
    expect([...list].sort(compareListed).map((c) => c.slug)).toEqual([NO_BABY, BABY]);
  });

  it("orders baby-model products among themselves by best seller, then newest", () => {
    const list = [card(BABY, { created_at: "2026-09-01T00:00:00.000Z" }), card(BABY_2, { sales_rank: 3 })];
    expect([...list].sort(compareListed).map((c) => c.slug)).toEqual([BABY_2, BABY]);
  });
});

describe("featuredCards", () => {
  it("is the best-selling in-stock baby-model products, best seller first", () => {
    const list = [
      card(NO_BABY, { sales_rank: 1 }),
      card(BABY, { sales_rank: 5 }),
      card(BABY_2, { sales_rank: 2 }),
      card(modelPhotos.withBaby[2]!, { sales_rank: 1, in_stock: false }),
      card(modelPhotos.withBaby[3]!, { sales_rank: 3, images: [] }),
    ];
    expect(featuredCards(list, 8).map((c) => c.slug)).toEqual([BABY_2, BABY]);
  });

  it("fills up with unsold baby-model products, newest first, and stops at the limit", () => {
    const list = [
      card(BABY, { created_at: "2026-01-01T00:00:00.000Z" }),
      card(BABY_2, { created_at: "2026-05-01T00:00:00.000Z" }),
      card(modelPhotos.withBaby[2]!, { sales_rank: 4 }),
    ];
    expect(featuredCards(list, 2).map((c) => c.slug)).toEqual([modelPhotos.withBaby[2], BABY_2]);
  });
});
