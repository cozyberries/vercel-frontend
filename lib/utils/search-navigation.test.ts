import { describe, expect, it } from "vitest";
import { FOCUS_SEARCH_EVENT, SEARCH_HASH, searchIconAction } from "./search-navigation";

// Regression (2026-09-14): the header search icon was a plain link to /products, so tapping it on a
// filtered results page threw every applied filter away. On /products it must only focus the search
// box; elsewhere it navigates and asks the products page to focus the box on arrival.

describe("searchIconAction", () => {
  it("focuses in place when already on the products page", () => {
    expect(searchIconAction("/products")).toEqual({ kind: "focus" });
    expect(searchIconAction("/products/")).toEqual({ kind: "focus" });
  });
  it("navigates to the products page with the focus hash from anywhere else", () => {
    expect(searchIconAction("/")).toEqual({ kind: "navigate", href: `/products${SEARCH_HASH}` });
    expect(searchIconAction("/products/frock-japanese-soft-pear")).toEqual({ kind: "navigate", href: `/products${SEARCH_HASH}` });
    expect(searchIconAction("/wishlist")).toEqual({ kind: "navigate", href: `/products${SEARCH_HASH}` });
  });
  it("exposes stable names for the hash and the event", () => {
    expect(SEARCH_HASH).toBe("#search");
    expect(FOCUS_SEARCH_EVENT).toBe("cozyberries:focus-search");
  });
});
