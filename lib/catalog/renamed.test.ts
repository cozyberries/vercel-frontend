import { describe, expect, it } from "vitest";
import renamed from "./renamed-products.json";
import { RENAMED_PRODUCTS, currentPrintSlug, currentProductSlug, withCurrentSlugs } from "./renamed";
import { renamedProductRedirects } from "./renamed-redirects.mjs";

// 2026-10-10: 13 products had slugs that named the wrong print or style (titles were right).
// Each got a brand-new slug; no slug ever changes meaning, so old links can always redirect.

describe("renamed-products.json", () => {
  const olds = Object.keys(renamed.products);
  const news = Object.values(renamed.products);

  it("renames 13 products to 13 distinct, slug-shaped new slugs", () => {
    expect(olds).toHaveLength(13);
    expect(new Set(news).size).toBe(13);
    for (const slug of [...olds, ...news]) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("never reuses an old slug as a new one", () => {
    expect(news.filter((slug) => olds.includes(slug))).toEqual([]);
  });

  it("names every pyjama by its rib", () => {
    for (const [old, now] of Object.entries(renamed.products)) {
      if (old.startsWith("pyjamas-")) expect(now).toMatch(/^pyjamas-with(out)?-rib-/);
    }
  });

  it("fixes the Naughty Nuts print slug", () => {
    expect(renamed.prints).toEqual({ "naugthy-nuts": "naughty-nuts" });
  });
});

describe("currentProductSlug / currentPrintSlug", () => {
  it("maps old slugs and passes everything else through", () => {
    expect(currentProductSlug("coords-set-chinese-collar-soft-pear")).toBe("coords-set-boys-petal-pops");
    expect(currentProductSlug("coords-set-boys-petal-pops")).toBe("coords-set-boys-petal-pops");
    expect(currentProductSlug("frock-japanese-soft-pear")).toBe("frock-japanese-soft-pear");
    expect(currentPrintSlug("naugthy-nuts")).toBe("naughty-nuts");
    expect(currentPrintSlug("soft-pear")).toBe("soft-pear");
    expect(RENAMED_PRODUCTS["pyjamas-ribbed-popsicles"]).toBe("pyjamas-without-rib-popsicles");
  });
});

describe("withCurrentSlugs", () => {
  it("re-keys old ids and the old print, and keeps the first of two lines that now share an id", () => {
    const items = [
      { id: "pyjamas-classic-popsicles", color: "popsicles", name: "a" },
      { id: "coords-set-boys-naughty-nuts", color: "naugthy-nuts", name: "b" },
      { id: "pyjamas-with-rib-popsicles", name: "c" },
      { id: "frock-japanese-soft-pear", name: "d" },
    ];
    expect(withCurrentSlugs(items)).toEqual([
      { id: "pyjamas-with-rib-popsicles", color: "popsicles", name: "a" },
      { id: "coords-set-boys-naughty-nuts", color: "naughty-nuts", name: "b" },
      { id: "frock-japanese-soft-pear", name: "d" },
    ]);
  });
});

describe("renamedProductRedirects", () => {
  it("308s every old product URL to its new one", () => {
    const redirects = renamedProductRedirects();
    expect(redirects).toHaveLength(13);
    expect(redirects).toContainEqual({
      source: "/products/jhabla-shorts-half-sleeve-soft-pear",
      destination: "/products/coords-set-girls-ruffle-soft-pear",
      permanent: true,
    });
  });
});
