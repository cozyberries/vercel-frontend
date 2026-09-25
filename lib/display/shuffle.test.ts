import { describe, expect, it } from "vitest";
import { nextCycle } from "./shuffle";

/** mulberry32: small deterministic PRNG so shuffles are reproducible. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const slides = ["a", "b", "c", "d"].map((slug) => ({ slug }));
const slugs = (list: { slug: string }[]) => list.map((s) => s.slug);

describe("nextCycle", () => {
  it("plays every slide exactly once per cycle", () => {
    for (let seed = 1; seed <= 50; seed++) {
      expect(slugs(nextCycle(slides, null, seeded(seed))).sort()).toEqual(["a", "b", "c", "d"]);
    }
  });

  it("never starts a cycle on the slide the previous cycle ended with", () => {
    for (let seed = 1; seed <= 200; seed++) {
      expect(nextCycle(slides, "c", seeded(seed))[0].slug).not.toBe("c");
    }
  });

  it("rotates by one when the shuffle would repeat the last slide", () => {
    // random() ≈ 1 makes Fisher–Yates swap every item with itself: order stays a, b, c, d.
    expect(slugs(nextCycle(slides, "a", () => 0.999))).toEqual(["b", "c", "d", "a"]);
  });

  it("handles one-slide and empty loops", () => {
    expect(slugs(nextCycle([{ slug: "a" }], "a"))).toEqual(["a"]);
    expect(nextCycle([], "a")).toEqual([]);
  });

  it("does not mutate its input", () => {
    const input = [...slides];
    nextCycle(input, null, seeded(7));
    expect(slugs(input)).toEqual(["a", "b", "c", "d"]);
  });
});
