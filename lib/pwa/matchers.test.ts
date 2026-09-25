import { describe, expect, it } from "vitest";
import { isDisplayNavigation } from "./matchers";

const at = (path: string, mode: RequestMode = "navigate") => ({
  request: { mode },
  url: new URL(path, "https://cozyberries.in"),
});

describe("isDisplayNavigation", () => {
  it("matches navigations to /display, with or without a query or trailing slash", () => {
    expect(isDisplayNavigation(at("/display"))).toBe(true);
    expect(isDisplayNavigation(at("/display?x=1"))).toBe(true);
    expect(isDisplayNavigation(at("/display/"))).toBe(true);
  });

  it("ignores other pages and non-navigation requests", () => {
    expect(isDisplayNavigation(at("/products"))).toBe(false);
    expect(isDisplayNavigation(at("/displayed"))).toBe(false);
    expect(isDisplayNavigation(at("/display", "cors"))).toBe(false);
  });
});
