// Browser only: shrinks a phone photo to a square JPEG before upload, so it stays well under
// Vercel's 4.5 MB request limit. The shop shows every photo as a square, centre-cropped.
export const UPLOAD_SIZE = 2000;

/** The centred square of a w × h image, and the side to draw it at (never upscaled). */
export function squareCrop(width: number, height: number, max = UPLOAD_SIZE) {
  const side = Math.min(width, height);
  return { sx: Math.round((width - side) / 2), sy: Math.round((height - side) / 2), side, out: Math.min(side, max) };
}

export async function squareJpeg(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Couldn't read this photo; try a JPEG or PNG");
  }
  const { sx, sy, side, out } = squareCrop(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare photos");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("Couldn't prepare this photo");
  return blob;
}
