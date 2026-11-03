// Server-only: turns one uploaded photo into what the shop serves. The site never shows N.jpg
// itself, only <stem>_list|detail|thumbnail.webp|avif (lib/utils/image.ts getVariantUrl), so a
// photo without those six files shows blank. Presets match scripts/preprocess-images.mjs.
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "media";
export const MASTER_SIZE = 2000;
export const PRESETS = {
  list: { width: 750, height: 750, quality: 70 },
  detail: { width: 1000, height: 1000, quality: 90 },
  thumbnail: { width: 120, height: 120, quality: 75 },
} as const;
const FORMATS = ["webp", "avif"] as const;

export interface PhotoFile {
  name: string;
  body: Buffer;
  contentType: string;
}

/** A fresh name per upload, so browsers and the service worker never show an older photo from the same URL. */
export function photoStem(now = new Date()): string {
  return `p-${now.getTime().toString(36)}-${randomBytes(3).toString("hex")}`;
}

/**
 * The square master JPEG (centre-cropped, at most 2000 px, EXIF rotation applied) plus the six
 * resized variants. Throws on anything sharp can't read as an image.
 */
export async function buildPhotoFiles(input: Buffer, stem: string): Promise<PhotoFile[]> {
  const upright = await sharp(input).rotate().toBuffer();
  const { width = 0, height = 0 } = await sharp(upright).metadata();
  if (width < 300 || height < 300) throw new Error("TOO_SMALL");
  const side = Math.min(width, height, MASTER_SIZE);
  const master = await sharp(upright).resize(side, side, { fit: "cover", position: "center" }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();

  const files: PhotoFile[] = [{ name: `${stem}.jpg`, body: master, contentType: "image/jpeg" }];
  for (const [preset, { width: w, height: h, quality }] of Object.entries(PRESETS)) {
    for (const format of FORMATS) {
      const resized = sharp(master).resize(w, h, { fit: "cover", position: "center" });
      const body = await (format === "webp" ? resized.webp({ quality }) : resized.avif({ quality })).toBuffer();
      files.push({ name: `${stem}_${preset}.${format}`, body, contentType: `image/${format}` });
    }
  }
  return files;
}

/** Uploads every file under media/products/<slug>/ and returns the master's public URL. */
export async function uploadPhotoFiles(admin: SupabaseClient, slug: string, files: PhotoFile[]): Promise<string> {
  const storage = admin.storage.from(BUCKET);
  await Promise.all(
    files.map(async (f) => {
      const { error } = await storage.upload(`products/${slug}/${f.name}`, f.body, { contentType: f.contentType, upsert: false });
      if (error) throw new Error(`[admin-products] upload ${f.name}: ${error.message}`);
    }),
  );
  return storage.getPublicUrl(`products/${slug}/${files[0].name}`).data.publicUrl;
}
