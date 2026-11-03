import { describe, expect, it } from "vitest";
import { addSize, createBody, draftFrom, EMPTY_DRAFT, hasChanges, removeNewSize, sizesToAdd, updateBody } from "./form";
import type { AdminProduct } from "./types";

const PRODUCT: AdminProduct = {
  slug: "frock-pine",
  name: "Pine Cone Frock",
  description: "Soft",
  care_instructions: "",
  category_slug: "sleeveless-frocks",
  gender_slug: "girl",
  color_slug: "pine-cone",
  color_name: "Pine Cone",
  features: ["Cotton"],
  images: [],
  variants: [
    { slug: "frock-pine-0-3m-pine-cone", size_slug: "0-3m", size_name: "0-3M", price: 923, stock_quantity: 2 },
    { slug: "frock-pine-2-3y-pine-cone", size_slug: "2-3y", size_name: "2-3Y", price: 980, stock_quantity: 0 },
  ],
};
const SIZES = [
  { slug: "0-3m", name: "0-3M" },
  { slug: "3-6m", name: "3-6M" },
  { slug: "2-3y", name: "2-3Y" },
  { slug: "3-4y", name: "3-4Y" },
];
const ORDER = SIZES.map((s) => s.slug);

describe("updateBody", () => {
  it("sends nothing when nothing changed", () => {
    const d = draftFrom(PRODUCT);
    expect(updateBody(PRODUCT, d)).toEqual({ variants: [], add_sizes: [] });
    expect(hasChanges(PRODUCT, d)).toBe(false);
  });

  it("sends a stock change with the count it started from, and a price change alone", () => {
    const d = draftFrom(PRODUCT);
    d.sizes[0] = { ...d.sizes[0], stock: 5 };
    d.sizes[1] = { ...d.sizes[1], price: "1000" };
    expect(updateBody(PRODUCT, d)).toEqual({
      variants: [
        { slug: "frock-pine-0-3m-pine-cone", stock: { from: 2, to: 5 } },
        { slug: "frock-pine-2-3y-pine-cone", price: 1000 },
      ],
      add_sizes: [],
    });
  });

  it("sends details (features one per line) only when one changed", () => {
    const d = { ...draftFrom(PRODUCT), features: "Cotton\n\n  Breathable  " };
    expect(updateBody(PRODUCT, d).details).toEqual({
      name: "Pine Cone Frock",
      description: "Soft",
      care_instructions: "",
      category_slug: "sleeveless-frocks",
      gender_slug: "girl",
      features: ["Cotton", "Breathable"],
    });
  });

  it("sends a typed price that isn't a whole number as NaN for the server to name", () => {
    const d = draftFrom(PRODUCT);
    d.sizes[0] = { ...d.sizes[0], price: "92.5" };
    expect(updateBody(PRODUCT, d).variants[0].price).toBeNaN();
  });
});

describe("adding sizes", () => {
  it("offers only sizes the product lacks", () => {
    expect(sizesToAdd(SIZES, draftFrom(PRODUCT)).map((s) => s.slug)).toEqual(["3-6m", "3-4y"]);
  });

  it("slots a new size in chart order, priced like its neighbour, and sends it as an added size", () => {
    const d = addSize(draftFrom(PRODUCT), { slug: "3-4y", name: "3-4Y" }, ORDER);
    expect(d.sizes.map((s) => s.size_slug)).toEqual(["0-3m", "2-3y", "3-4y"]);
    expect(d.sizes[2]).toMatchObject({ price: "980", stock: 0 });
    expect(updateBody(PRODUCT, d).add_sizes).toEqual([{ size_slug: "3-4y", price: 980, stock: 0 }]);
  });

  it("can take back an added size but never an existing one", () => {
    const d = addSize(draftFrom(PRODUCT), { slug: "3-6m", name: "3-6M" }, ORDER);
    expect(removeNewSize(d, "3-6m").sizes).toHaveLength(2);
    expect(removeNewSize(d, "0-3m").sizes).toHaveLength(3);
  });

  it("starts the first size of a new product with an empty price", () => {
    expect(addSize(EMPTY_DRAFT, { slug: "0-3m", name: "0-3M" }, ORDER).sizes[0].price).toBe("");
  });
});

describe("createBody", () => {
  it("sends every field with the sizes", () => {
    const d = addSize({ ...EMPTY_DRAFT, name: "New", slug: " new ", color_slug: "pine-cone", features: "A" }, { slug: "0-3m", name: "0-3M" }, ORDER);
    d.sizes[0] = { ...d.sizes[0], price: "923", stock: 3 };
    expect(createBody(d)).toEqual({
      name: "New",
      description: "",
      care_instructions: "",
      category_slug: "",
      gender_slug: "",
      features: ["A"],
      slug: "new",
      color_slug: "pine-cone",
      sizes: [{ size_slug: "0-3m", price: 923, stock: 3 }],
    });
  });
});
