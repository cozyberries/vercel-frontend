import type { ListCard, Snapshot } from "@/lib/catalog/types";
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
  /** 1000×1000 WebP variant of the first image. */
  photoUrl: string;
  /** The original first image, used when the variant cannot be fetched. */
  fallbackUrl: string;
}

function toSlide(card: ListCard, firstImage: string): DisplaySlide {
  return {
    slug: card.slug,
    name: card.name,
    photoUrl: getVariantUrl(firstImage, "detail", "webp"),
    fallbackUrl: normalizeAbsoluteUrl(firstImage.trim()),
  };
}

/** In-stock products whose first photo is tagged withBaby, in snapshot order. */
export function selectSlides(snapshot: Snapshot, tags: ModelPhotoTags): DisplaySlide[] {
  const withBaby = new Set(tags.withBaby);
  return snapshot.products.flatMap((card) => {
    const first = card.images[0];
    return card.in_stock && withBaby.has(card.slug) && first ? [toSlide(card, first)] : [];
  });
}
