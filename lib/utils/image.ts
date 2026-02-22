// Data-URL placeholder (gray image) so fallback never 404s
export const PLACEHOLDER_DATA_URL =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect fill="#e5e7eb" width="200" height="200"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9ca3af" font-size="14" font-family="sans-serif">No image</text></svg>'
  );

/**
 * Fixes malformed absolute URLs (e.g. "/https://..." from DB/cache) so they load correctly.
 */
export function normalizeAbsoluteUrl(s: string): string {
  const t = s.trim();
  if (t.startsWith("/https") || t.startsWith("//https") || t.startsWith("/http") || t.startsWith("//http")) return t.replace(/^\/+/, "");
  return t;
}

/**
 * Normalizes a URL value for safe usage in image src attributes.
 * Strips one or two leading slashes from absolute URLs and trims whitespace.
 * Returns undefined if the value is empty or not a string.
 */
export function normalizeUrl(value: string | undefined): string | undefined {
  if (!value || typeof value !== "string") return undefined;
  const s = value.trim();
  // Strip one or two leading slashes before "http" (handles "/http..." and "//http...")
  if (s.startsWith("/https") || s.startsWith("//https") || s.startsWith("/http") || s.startsWith("//http")) {
    return s.replace(/^\/+/, "");
  }
  return s;
}

/**
 * Resolves an image URL from an image object.
 * Used by API routes to construct consistent image URLs for responses.
 */
export function resolveImageUrl(img: { url?: string }): string | undefined {
  return normalizeUrl(img.url);
}

/**
 * Normalizes any value to a string URL safe for Next.js Image src.
 * Prevents "Image is missing required src property" when API returns objects or empty values.
 * Also fixes malformed absolute URLs (leading slash before "https").
 */
export function toImageSrc(value: unknown, fallback: string = PLACEHOLDER_DATA_URL): string {
  if (typeof value === "string" && value.trim() !== "") return normalizeAbsoluteUrl(value.trim());
  if (value && typeof value === "object" && "url" in value) {
    const u = (value as { url?: unknown }).url;
    if (typeof u === "string" && u.trim() !== "") return normalizeAbsoluteUrl(u.trim());
  }
  return fallback;
}
