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

  it("records the tagging date as an ISO date", () => {
    expect(tags.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(tags.checkedAt))).toBe(false);
  });
});
