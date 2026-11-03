"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { squareJpeg } from "@/lib/admin/products/client-photo";
import type { AdminProduct } from "@/lib/admin/products/types";
import { getVariantUrl } from "@/lib/utils/image";

async function send(url: string, init: RequestInit): Promise<AdminProduct> {
  const res = await fetch(url, { credentials: "same-origin", ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "Something went wrong; try again");
  return body.product as AdminProduct;
}

/** The product's photos in shop order (first = main photo): add from the phone, move, remove. */
export function PhotoManager({ slug, images, onProduct }: { slug: string; images: string[]; onProduct: (p: AdminProduct) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endpoint = `/api/admin/products/${slug}/images`;

  const upload = async (files: File[]) => {
    setError(null);
    try {
      for (const [i, file] of files.entries()) {
        setBusy(files.length > 1 ? `Adding photo ${i + 1} of ${files.length}…` : "Adding photo…");
        const form = new FormData();
        form.append("photo", await squareJpeg(file), "photo.jpg");
        onProduct(await send(endpoint, { method: "POST", body: form }));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  const reorder = async (urls: string[], label: string) => {
    setError(null);
    setBusy(label);
    try {
      onProduct(await send(endpoint, { method: "PUT", body: JSON.stringify({ urls }), headers: { "content-type": "application/json" } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const move = (from: number, to: number) => {
    const next = [...images];
    const [url] = next.splice(from, 1);
    next.splice(to, 0, url);
    void reorder(next, "Saving order…");
  };

  const remove = (i: number) => {
    if (!window.confirm(`Remove photo ${i + 1} from this product?`)) return;
    void reorder(images.filter((_, j) => j !== i), "Removing photo…");
  };

  return (
    <section className="rounded-2xl border border-cb-border bg-cb-white p-4">
      <h2 className="font-semibold text-cb-fg">Photos</h2>
      <p className="mt-0.5 text-sm text-cb-muted-fg">The first photo is the main one. The shop shows the middle square of each photo.</p>
      {images.length > 0 ? (
        <ol className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((url, i) => (
            <li key={url} className="overflow-hidden rounded-xl border border-cb-border">
              <div className="relative aspect-square bg-cb-linen">
                {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of storage variants */}
                <img
                  src={getVariantUrl(url, "list", "webp")}
                  onError={(e) => {
                    if (e.currentTarget.src !== url) e.currentTarget.src = url;
                  }}
                  alt={`Photo ${i + 1}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                {i === 0 && <span className="absolute left-2 top-2 rounded-full bg-cb-white/90 px-2 py-0.5 text-xs font-semibold text-cb-fg">Main</span>}
              </div>
              <div className="flex items-center justify-between p-1">
                <Button type="button" variant="ghost" size="icon" className="h-10 w-10" aria-label={`Move photo ${i + 1} earlier`} disabled={!!busy || i === 0} onClick={() => move(i, i - 1)}>
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-10 w-10 text-red-700" aria-label={`Remove photo ${i + 1}`} disabled={!!busy} onClick={() => remove(i)}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10"
                  aria-label={`Move photo ${i + 1} later`}
                  disabled={!!busy || i === images.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-cb-muted-fg">No photos yet; the shop shows a grey placeholder.</p>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        aria-label="Choose photos"
        onChange={(e) => void upload(Array.from(e.target.files ?? []))}
      />
      <Button type="button" variant="outline" className="mt-3 h-11 w-full rounded-full" disabled={!!busy} onClick={() => input.current?.click()}>
        {busy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            {busy}
          </>
        ) : (
          <>
            <ImagePlus className="mr-2 h-4 w-4" aria-hidden />
            Add photos
          </>
        )}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
