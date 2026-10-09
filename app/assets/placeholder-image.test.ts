import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { images } from "./images";

// /placeholder.jpg is what product cards, cart lines, the wishlist and the hero show when a
// photo is missing. It used to be a 1x1 half-transparent pure-green PNG, so a product added
// without photos showed as a bright green tile.
const file = path.join(process.cwd(), "public", "placeholder.jpg");

describe("placeholder image", () => {
  it("is what the product fallbacks point at", () => {
    expect(images.staticProductImage).toBe("/placeholder.jpg");
  });

  it("is a real JPEG large enough to fill a card", async () => {
    const meta = await sharp(readFileSync(file)).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBeGreaterThanOrEqual(400);
    expect(meta.height).toBeGreaterThanOrEqual(400);
    expect(meta.hasAlpha).toBe(false);
  });

  it("is a light neutral grey, not a colour", async () => {
    const { channels } = await sharp(readFileSync(file)).stats();
    const [r, g, b] = channels.map((c) => c.mean);
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(12);
    expect(Math.min(r, g, b)).toBeGreaterThan(200);
  });
});
