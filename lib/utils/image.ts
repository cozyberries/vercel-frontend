export const DEFAULT_PLACEHOLDER = "/placeholder.svg";

/**
 * Normalizes any value to a string URL safe for Next.js Image src.
 * Prevents "Image is missing required src property" when API returns objects or empty values.
 */
export function toImageSrc(value: unknown, fallback: string = DEFAULT_PLACEHOLDER): string {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (value && typeof value === "object" && "url" in value) {
    const u = (value as { url?: unknown }).url;
    if (typeof u === "string" && u.trim() !== "") return u.trim();
  }
  return fallback;
}
