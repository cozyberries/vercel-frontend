"use client";

import type { CSSProperties } from "react";
import { toImageSrc, getVariantUrl, PLACEHOLDER_DATA_URL, SupabaseImagePreset, normalizeAbsoluteUrl } from "@/lib/utils/image";

interface SupabaseImageProps {
  /** Raw image value — same type accepted by toImageSrc() */
  src: unknown;
  preset?: SupabaseImagePreset;
  alt: string;
  width?: number;
  height?: number;
  /** Fill parent container (mirrors Next.js Image fill behaviour) */
  fill?: boolean;
  className?: string;
  /** Adds fetchpriority="high" and loading="eager" */
  priority?: boolean;
  /** fetchpriority override (e.g. "low" for preload hints) */
  fetchPriority?: "high" | "low" | "auto";
  sizes?: string;
  style?: CSSProperties;
  draggable?: boolean;
}

/**
 * Renders a <picture> element with AVIF, WebP, and JPEG sources.
 * The browser picks the best supported format automatically.
 * AVIF/WebP sources point to pre-generated variants in Supabase Storage.
 * The JPEG <img> fallback uses the Supabase render URL (resized on the fly).
 */
export default function SupabaseImage({
  src,
  preset,
  alt,
  width,
  height,
  fill = false,
  className = "",
  priority = false,
  fetchPriority,
  sizes,
  style,
  draggable,
}: SupabaseImageProps) {
  // Resolve the raw string URL for variant derivation
  let rawUrl: string | undefined;
  if (typeof src === "string" && src.trim() !== "") {
    rawUrl = normalizeAbsoluteUrl(src.trim());
  } else if (src && typeof src === "object" && "url" in src) {
    const u = (src as { url?: unknown }).url;
    if (typeof u === "string" && u.trim() !== "") rawUrl = normalizeAbsoluteUrl(u.trim());
  }

  const fallbackSrc = toImageSrc(src, PLACEHOLDER_DATA_URL, preset);
  const hasVariants = !!(preset && rawUrl);
  const avifSrc = hasVariants ? getVariantUrl(rawUrl!, preset!, "avif") : undefined;
  const webpSrc = hasVariants ? getVariantUrl(rawUrl!, preset!, "webp") : undefined;

  const resolvedFetchPriority = fetchPriority ?? (priority ? "high" : undefined);
  const loading = priority ? "eager" : "lazy";

  if (fill) {
    return (
      <picture
        style={{
          display: "block",
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      >
        {avifSrc && <source type="image/avif" srcSet={avifSrc} sizes={sizes} />}
        {webpSrc && <source type="image/webp" srcSet={webpSrc} sizes={sizes} />}
        <img
          src={fallbackSrc}
          alt={alt}
          sizes={sizes}
          className={`w-full h-full object-cover${className ? ` ${className}` : ""}`}
          loading={loading}
          fetchPriority={resolvedFetchPriority}
          draggable={draggable}
          style={style}
        />
      </picture>
    );
  }

  return (
    <picture>
      {avifSrc && <source type="image/avif" srcSet={avifSrc} sizes={sizes} />}
      {webpSrc && <source type="image/webp" srcSet={webpSrc} sizes={sizes} />}
      <img
        src={fallbackSrc}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        className={className}
        loading={loading}
        fetchPriority={resolvedFetchPriority}
        draggable={draggable}
        style={style}
      />
    </picture>
  );
}
