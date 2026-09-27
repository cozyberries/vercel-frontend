import { describe, expect, it } from "vitest";
import tags from "./model-photos.json";

const all = [...tags.withBaby, ...tags.withoutBaby];

describe("model-photos.json", () => {
  it("has no duplicate slugs", () => {
    expect(new Set(all).size).toBe(all.length);
  });

  it("never lists a slug as both withBaby and withoutBaby", () => {
    const withBaby = new Set(tags.withBaby);
    expect(tags.withoutBaby.filter((slug) => withBaby.has(slug))).toEqual([]);
  });

  it("holds slug-shaped entries only", () => {
    for (const slug of all) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  // Pyjama slugs say "classic" or "ribbed", but only the product name says which one has the rib:
  // pyjamas-classic-popsicles is "With Rib" (0-3M, 3-6M) and pyjamas-ribbed-popsicles is "Without Rib".
  // The model photo shows ribbed cuffs, so it is the first photo of the classic slug.
  it("tags the Popsicles pyjama model photo on the With Rib product", () => {
    expect(tags.withBaby).toContain("pyjamas-classic-popsicles");
    expect(tags.withoutBaby).toContain("pyjamas-ribbed-popsicles");
  });

  it("records the tagging date as an ISO date", () => {
    expect(tags.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(tags.checkedAt))).toBe(false);
  });
});
