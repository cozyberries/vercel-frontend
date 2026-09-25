import type { ListCard, Snapshot } from "@/lib/catalog/types";
import { getMinPrice } from "@/lib/utils";
import { getVariantUrl, normalizeAbsoluteUrl } from "@/lib/utils/image";

/** Result of the one-off vision pass over each product's first photo (lib/display/model-photos.json). */
export interface ModelPhotoTags {
  checkedAt: string;
  withBaby: string[];
  withoutBaby: string[];
}

/** One slide of the stall display loop. */
export interface DisplaySlide {
  slug: string;
  name: string;
  minPrice: number;
  hasRange: boolean;
  /** 1000×1000 WebP variant of the first image. */
  photoUrl: string;
  /** The original first image, used when the variant cannot be fetched. */
  fallbackUrl: string;
  /** Absolute product link carrying the stall UTM tags; encoded in the slide's QR code. */
  productUrl: string;
}

export const DISPLAY_UTM = "utm_source=stall&utm_medium=display";

export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "") || "https://cozyberries.in";
}

/** Absolute site URL for `path` with the stall UTM tags appended. */
export function displayUrl(path: string, origin: string = siteOrigin()): string {
  return `${origin}${path}${path.includes("?") ? "&" : "?"}${DISPLAY_UTM}`;
}

function toSlide(card: ListCard, firstImage: string, origin: string): DisplaySlide {
  // ListCard.sizes carries the price/stock fields getMinPrice reads; listing cards have no variants.
  const { min, hasRange } = getMinPrice({ price: card.price, sizes: card.sizes, variants: [] });
  return {
    slug: card.slug,
    name: card.name,
    minPrice: min,
    hasRange,
    photoUrl: getVariantUrl(firstImage, "detail", "webp"),
    fallbackUrl: normalizeAbsoluteUrl(firstImage.trim()),
    productUrl: displayUrl(`/products/${card.slug}`, origin),
  };
}

/** In-stock products whose first photo is tagged withBaby, in snapshot order. */
export function selectSlides(snapshot: Snapshot, tags: ModelPhotoTags, origin: string = siteOrigin()): DisplaySlide[] {
  const withBaby = new Set(tags.withBaby);
  return snapshot.products.flatMap((card) => {
    const first = card.images[0];
    return card.in_stock && withBaby.has(card.slug) && first ? [toSlide(card, first, origin)] : [];
  });
}
