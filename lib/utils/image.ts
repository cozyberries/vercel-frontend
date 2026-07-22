// Data-URL placeholder (gray image) so fallback never 404s
export const PLACEHOLDER_DATA_URL =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect fill="#e5e7eb" width="200" height="200"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9ca3af" font-size="14" font-family="sans-serif">No image</text></svg>'
  );

/** Supabase storage object path: /storage/v1/object/public/... */
const SUPABASE_OBJECT_PREFIX = "/storage/v1/object/public/";
/** Supabase image render path for transforms */
const SUPABASE_RENDER_PREFIX = "/storage/v1/render/image/public/";

export type SupabaseImagePreset = "list" | "detail" | "thumbnail";

const PRESETS: Record<
  SupabaseImagePreset,  
  { width: number; height: number; quality: number }
> = {
  /** Product listing / card: smaller, lower quality for fast load */
  list: { width: 750, height: 750, quality: 70 },
  /** Product detail page: larger, higher quality for better experience */
  detail: { width: 1000, height: 1000, quality: 90 },
  /** Small thumbnails (e.g. detail page gallery) */
  thumbnail: { width: 120, height: 120, quality: 75 },
};

/**
 * Returns true if the URL is a Supabase storage public object URL that supports image transforms.
 * Skips SVGs and non-image paths so we don't break them.
 */
function isSupabaseStorageImageUrl(url: string): boolean {
  const normalized = url.trim();
  if (!normalized.includes(".supabase.co") || !normalized.includes(SUPABASE_OBJECT_PREFIX)) return false;
  const lower = normalized.toLowerCase();
  if (lower.endsWith(".svg") || lower.includes(".svg?")) return false;
  return true;
}

/**
 * Converts a Supabase storage object URL to a render URL with width, height, quality, and WebP.
 * Non-Supabase or non-image URLs are returned unchanged.
 */
export function getSupabaseImageTransformUrl(
  url: string,
  preset: SupabaseImagePreset
): string {
  const normalized = normalizeAbsoluteUrl(url.trim());
  if (!isSupabaseStorageImageUrl(normalized)) return normalized;
  const renderPath = normalized.replace(SUPABASE_OBJECT_PREFIX, SUPABASE_RENDER_PREFIX);
  const { width, height, quality } = PRESETS[preset];
  const separator = renderPath.includes("?") ? "&" : "?";
  return `${renderPath}${separator}width=${width}&height=${height}&quality=${quality}`;
}

/**
 * Returns the public URL for a pre-generated WebP or AVIF variant of a Supabase storage image.
 * Variants are stored alongside originals with a preset suffix: 1.jpg → 1_list.webp
 * Returns the original URL unchanged for non-Supabase or SVG URLs.
 */
export function getVariantUrl(
  url: string,
  preset: SupabaseImagePreset,
  format: "webp" | "avif"
): string {
  const normalized = normalizeAbsoluteUrl(url.trim());
  if (!isSupabaseStorageImageUrl(normalized)) return normalized;
  const withoutQuery = normalized.split("?")[0];
  const lastDot = withoutQuery.lastIndexOf(".");
  const base = lastDot !== -1 ? withoutQuery.substring(0, lastDot) : withoutQuery;
  return `${base}_${preset}.${format}`;
}

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
 * When preset is provided, Supabase storage URLs are converted to transform URLs (resize, quality, WebP).
 */
export function toImageSrc(
  value: unknown,
  fallback: string = PLACEHOLDER_DATA_URL,
  preset?: SupabaseImagePreset
): string {
  let url: string;
  if (typeof value === "string" && value.trim() !== "") {
    url = normalizeAbsoluteUrl(value.trim());
  } else if (value && typeof value === "object" && "url" in value) {
    const u = (value as { url?: unknown }).url;
    if (typeof u === "string" && u.trim() !== "") {
      url = normalizeAbsoluteUrl(u.trim());
    } else {
      return fallback;
    }
  } else {
    return fallback;
  }
  if (preset && isSupabaseStorageImageUrl(url)) {
    return getSupabaseImageTransformUrl(url, preset);
  }
  return url;
}
