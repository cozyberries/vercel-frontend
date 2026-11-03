import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { buildPhotoFiles, photoStem, uploadPhotoFiles } from "./photos";

async function jpeg(width: number, height: number, orientation?: number) {
  const img = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 90 } } }).jpeg();
  return (orientation ? img.withMetadata({ orientation }) : img).toBuffer();
}

describe("buildPhotoFiles", () => {
  it("makes a square master and the six variants the shop serves", async () => {
    const files = await buildPhotoFiles(await jpeg(1200, 1600), "p-abc");
    expect(files.map((f) => f.name)).toEqual([
      "p-abc.jpg",
      "p-abc_list.webp",
      "p-abc_list.avif",
      "p-abc_detail.webp",
      "p-abc_detail.avif",
      "p-abc_thumbnail.webp",
      "p-abc_thumbnail.avif",
    ]);
    const master = await sharp(files[0].body).metadata();
    expect([master.width, master.height, master.format]).toEqual([1200, 1200, "jpeg"]);
    const thumb = await sharp(files[5].body).metadata();
    expect([thumb.width, thumb.height, thumb.format]).toEqual([120, 120, "webp"]);
  });

  it("caps the master at 2000 px and applies the phone's rotation first", async () => {
    // Stored 3000×2400 landscape with "rotate 90°": upright it is portrait, still square after the crop.
    const files = await buildPhotoFiles(await jpeg(3000, 2400, 6), "p-x");
    const master = await sharp(files[0].body).metadata();
    expect([master.width, master.height]).toEqual([2000, 2000]);
    expect(master.orientation ?? 1).toBe(1);
  });

  it("refuses tiny images and non-images", async () => {
    await expect(buildPhotoFiles(await jpeg(200, 200), "p")).rejects.toThrow("TOO_SMALL");
    await expect(buildPhotoFiles(Buffer.from("not an image"), "p")).rejects.toThrow();
  });
});

describe("photoStem", () => {
  it("is unique per call", () => {
    const now = new Date("2026-11-04T10:00:00Z");
    expect(photoStem(now)).toMatch(/^p-[a-z0-9]+-[0-9a-f]{6}$/);
    expect(photoStem(now)).not.toBe(photoStem(now));
  });
});

describe("uploadPhotoFiles", () => {
  it("uploads under the product's folder without overwriting and returns the master URL", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/media/${path}` } }));
    const admin = { storage: { from: vi.fn(() => ({ upload, getPublicUrl })) } };
    const files = [
      { name: "p-1.jpg", body: Buffer.from("a"), contentType: "image/jpeg" },
      { name: "p-1_list.webp", body: Buffer.from("b"), contentType: "image/webp" },
    ];
    const url = await uploadPhotoFiles(admin as never, "frock-x", files);
    expect(admin.storage.from).toHaveBeenCalledWith("media");
    expect(upload).toHaveBeenCalledWith("products/frock-x/p-1_list.webp", files[1].body, { contentType: "image/webp", upsert: false });
    expect(url).toBe("https://x.supabase.co/storage/v1/object/public/media/products/frock-x/p-1.jpg");
  });

  it("fails when any file fails", async () => {
    const upload = vi.fn().mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "quota" } });
    const admin = { storage: { from: () => ({ upload, getPublicUrl: vi.fn() }) } };
    const files = [
      { name: "a.jpg", body: Buffer.from("a"), contentType: "image/jpeg" },
      { name: "a_list.webp", body: Buffer.from("b"), contentType: "image/webp" },
    ];
    await expect(uploadPhotoFiles(admin as never, "s", files)).rejects.toThrow("quota");
  });
});
