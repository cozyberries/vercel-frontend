import { describe, expect, it } from "vitest";
import { squareCrop } from "./client-photo";

describe("squareCrop", () => {
  it("takes the centred square of a portrait phone photo and shrinks it to 2000 px", () => {
    expect(squareCrop(3024, 4032)).toEqual({ sx: 0, sy: 504, side: 3024, out: 2000 });
  });

  it("never upscales a small photo", () => {
    expect(squareCrop(1200, 900)).toEqual({ sx: 150, sy: 0, side: 900, out: 900 });
  });
});
