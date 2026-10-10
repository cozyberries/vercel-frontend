import { describe, expect, it } from "vitest";
import modelPhotos from "../display/model-photos.json";
import { featuredSlugs, homeProductRows, withFeaturedBadge } from "./home";
import type { ListCard } from "./types";

// Regression (2026-10-10): once the default order led with baby-model best sellers, "Loved by
// Parents" (the first five products) repeated the Featured row card for card, and the Featured
// cards had no "Featured" badge because the badge read the old is_featured flag.

const baby = modelPhotos.withBaby;
const noBaby = modelPhotos.withoutBaby;

const card = (slug: string, sales_rank: number | null, extra: Partial<ListCard> = {}): ListCard =>
  ({
    slug, id: slug, name: slug, created_at: "2026-01-01T00:00:00.000Z", images: ["https://img/x.jpg"],
    in_stock: true, is_featured: false, sales_rank, ...extra,
  }) as ListCard;

const cards = [
  card(baby[0]!, 1),
  card(baby[1]!, 2),
  card(noBaby[0]!, 3),
  card(baby[2]!, 4),
  card(noBaby[1]!, 5),
  card(baby[3]!, null),
  card(noBaby[2]!, null, { is_featured: true }),
];

describe("homeProductRows", () => {
  it("never shows a product in both rows", () => {
    const { featured, lovedByParents } = homeProductRows(cards, { featured: 3, lovedByParents: 3 });
    const shared = featured.filter((f) => lovedByParents.some((l) => l.slug === f.slug));
    expect(shared).toEqual([]);
  });

  it("features the best-selling baby-model products and badges every one of them", () => {
    const { featured } = homeProductRows(cards, { featured: 3, lovedByParents: 3 });
    expect(featured.map((c) => c.slug)).toEqual([baby[0], baby[1], baby[2]]);
    expect(featured.every((c) => c.is_featured)).toBe(true);
  });

  it("fills Loved by Parents with the next best sellers, photo or not of a baby, and no Featured badge", () => {
    const { lovedByParents } = homeProductRows(cards, { featured: 3, lovedByParents: 3 });
    expect(lovedByParents.map((c) => c.slug)).toEqual([noBaby[0], noBaby[1], baby[3]]);
    // The old is_featured flag no longer marks a card as Featured.
    expect(homeProductRows(cards, { featured: 3, lovedByParents: 4 }).lovedByParents.every((c) => !c.is_featured)).toBe(true);
  });

  it("leaves sold-out products out of both rows", () => {
    const { featured, lovedByParents } = homeProductRows(
      [card(baby[0]!, 1, { in_stock: false }), card(noBaby[0]!, 2, { in_stock: false }), card(baby[1]!, null)],
      { featured: 3, lovedByParents: 3 },
    );
    expect([...featured, ...lovedByParents].map((c) => c.slug)).toEqual([baby[1]]);
  });
});

// Regression (2026-10-10): /products and the product page still badged products by the old
// is_featured flag, so their "Featured" stickers disagreed with the home Featured row.
describe("featuredSlugs and withFeaturedBadge", () => {
  it("names the same products as the home Featured row", () => {
    const { featured } = homeProductRows(cards, { featured: 5, lovedByParents: 5 });
    expect([...featuredSlugs(cards)]).toEqual(featured.map((c) => c.slug));
  });

  it("badges exactly the featured products and clears the old flag on every other", () => {
    const slugs = featuredSlugs(cards);
    const badged = withFeaturedBadge(cards, slugs);
    expect(badged.filter((c) => c.is_featured).map((c) => c.slug)).toEqual(cards.filter((c) => slugs.has(c.slug)).map((c) => c.slug));
    expect(badged.find((c) => c.slug === noBaby[2])!.is_featured).toBe(false);
  });
});
