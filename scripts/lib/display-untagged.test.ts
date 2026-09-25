import { describe, expect, it } from "vitest";
import { untaggedProducts } from "./display-untagged.mjs";

const tags = { withBaby: ["a"], withoutBaby: ["b"] };

describe("untaggedProducts", () => {
  it("returns products in neither list, in catalog order", () => {
    const products = [
      { slug: "new-2", images: [] },
      { slug: "a", images: [] },
      { slug: "b", images: [] },
      { slug: "new-1", images: ["https://img/new-1.jpg"] },
    ];
    expect(untaggedProducts(products, tags).map((p) => p.slug)).toEqual(["new-2", "new-1"]);
  });

  it("returns [] when every product is tagged", () => {
    expect(untaggedProducts([{ slug: "a" }, { slug: "b" }], tags)).toEqual([]);
  });
});
