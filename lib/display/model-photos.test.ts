import { describe, expect, it } from "vitest";
import renamed from "../catalog/renamed-products.json";
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

  // Pyjama slugs say the rib since 2026-10-10. The Popsicles model photo shows ribbed cuffs.
  it("tags the Popsicles pyjama model photo on the With Rib product", () => {
    expect(tags.withBaby).toContain("pyjamas-with-rib-popsicles");
    expect(tags.withoutBaby).toContain("pyjamas-without-rib-popsicles");
  });

  it("lists no slug that was renamed", () => {
    const old = new Set(Object.keys(renamed.products));
    expect(all.filter((slug) => old.has(slug))).toEqual([]);
  });

  it("records the tagging date as an ISO date", () => {
    expect(tags.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(tags.checkedAt))).toBe(false);
  });
});
