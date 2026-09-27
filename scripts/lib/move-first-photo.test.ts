import { describe, expect, it } from "vitest";
import { planFirstPhotoMove } from "./move-first-photo.mjs";

const SUFFIXES = [".jpg", "_detail.avif", "_detail.webp", "_list.avif", "_list.webp", "_thumbnail.avif", "_thumbnail.webp"];

function folder(count: number, extra: string[] = []) {
  return [...Array.from({ length: count }, (_, i) => SUFFIXES.map((s) => `${i + 1}${s}`)).flat(), ...extra];
}

/** Replays the moves against a fake bucket; every move must read a file that exists and write to a free slot. */
function replay(initial: string[], moves: { from: string; to: string }[]) {
  const bucket = new Map(initial.map((path) => [path, path]));
  for (const { from, to } of moves) {
    expect(bucket.has(from), `move reads missing ${from}`).toBe(true);
    expect(bucket.has(to), `move overwrites ${to}`).toBe(false);
    bucket.set(to, bucket.get(from)!);
    bucket.delete(from);
  }
  return bucket;
}

const paths = (slug: string, files: string[]) => files.map((f) => `products/${slug}/${f}`);

describe("planFirstPhotoMove", () => {
  const source = { slug: "pyjamas-ribbed-popsicles", files: folder(7, ["raw"]) };
  const target = { slug: "pyjamas-classic-popsicles", files: folder(7, ["raw"]) };
  const plan = planFirstPhotoMove(source, target);
  const bucket = replay([...paths(source.slug, source.files), ...paths(target.slug, target.files)], plan.moves);

  it("puts the source's first photo, with every variant, first in the target", () => {
    for (const s of SUFFIXES) {
      expect(bucket.get(`products/pyjamas-classic-popsicles/1${s}`)).toBe(`products/pyjamas-ribbed-popsicles/1${s}`);
    }
  });

  it("shifts the target's photos down one slot in their original order", () => {
    for (let n = 1; n <= 7; n++) {
      for (const s of SUFFIXES) {
        expect(bucket.get(`products/pyjamas-classic-popsicles/${n + 1}${s}`)).toBe(`products/pyjamas-classic-popsicles/${n}${s}`);
      }
    }
  });

  it("closes the gap it leaves in the source", () => {
    for (let n = 2; n <= 7; n++) {
      for (const s of SUFFIXES) {
        expect(bucket.get(`products/pyjamas-ribbed-popsicles/${n - 1}${s}`)).toBe(`products/pyjamas-ribbed-popsicles/${n}${s}`);
      }
    }
    expect(bucket.has("products/pyjamas-ribbed-popsicles/7.jpg")).toBe(false);
  });

  it("never touches entries that are not numbered photos", () => {
    expect(plan.moves.some(({ from, to }) => from.includes("raw") || to.includes("raw"))).toBe(false);
  });

  it("lists each product's originals in display order, one row per file", () => {
    expect(plan.images["pyjamas-classic-popsicles"]).toEqual(
      Array.from({ length: 8 }, (_, i) => `products/pyjamas-classic-popsicles/${i + 1}.jpg`),
    );
    expect(plan.images["pyjamas-ribbed-popsicles"]).toEqual(
      Array.from({ length: 6 }, (_, i) => `products/pyjamas-ribbed-popsicles/${i + 1}.jpg`),
    );
  });

  it("moves only the variants a slot actually has", () => {
    const partial = planFirstPhotoMove({ slug: "a", files: ["1.jpg", "2.jpg", "2_detail.webp"] }, { slug: "b", files: ["1.jpg"] });
    const result = replay([...paths("a", ["1.jpg", "2.jpg", "2_detail.webp"]), ...paths("b", ["1.jpg"])], partial.moves);
    expect([...result.keys()].sort()).toEqual(["products/a/1.jpg", "products/a/1_detail.webp", "products/b/1.jpg", "products/b/2.jpg"]);
  });

  it("refuses folders whose numbering has a gap or lacks an original", () => {
    expect(() => planFirstPhotoMove({ slug: "a", files: ["1.jpg", "3.jpg"] }, { slug: "b", files: ["1.jpg"] })).toThrow(/a.*1\.\.2/);
    expect(() => planFirstPhotoMove({ slug: "a", files: ["1.jpg"] }, { slug: "b", files: ["1_detail.webp"] })).toThrow(/b.*1\.jpg/);
  });

  it("refuses an empty source or moving a product onto itself", () => {
    expect(() => planFirstPhotoMove({ slug: "a", files: ["raw"] }, { slug: "b", files: ["1.jpg"] })).toThrow(/a has no photos/);
    expect(() => planFirstPhotoMove({ slug: "a", files: ["1.jpg"] }, { slug: "a", files: ["1.jpg"] })).toThrow(/different/);
  });
});
