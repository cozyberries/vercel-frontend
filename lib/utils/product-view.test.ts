import { describe, expect, it } from "vitest";
import { resolveProductView, viewParamFor } from "./product-view";

// 2026-09-14: mobile defaults to the list view; `?view=grid` opts back into the grid. Desktop is
// always a grid. Before hydration (isMobile unknown) the URL decides, so the server HTML matches
// what a phone will show without a flip.
describe("resolveProductView", () => {
  it("defaults to list on mobile and before hydration", () => {
    expect(resolveProductView(null, true)).toBe("list");
    expect(resolveProductView(null, null)).toBe("list");
    expect(resolveProductView("list", true)).toBe("list");
  });
  it("honours an explicit grid choice on mobile", () => {
    expect(resolveProductView("grid", true)).toBe("grid");
    expect(resolveProductView("grid", null)).toBe("grid");
  });
  it("is always grid on desktop", () => {
    expect(resolveProductView(null, false)).toBe("grid");
    expect(resolveProductView("list", false)).toBe("grid");
  });
  it("ignores unknown values", () => {
    expect(resolveProductView("table", true)).toBe("list");
  });
});

describe("viewParamFor", () => {
  it("writes ?view=grid only for the non-default choice", () => {
    expect(viewParamFor("grid")).toBe("grid");
    expect(viewParamFor("list")).toBeNull();
  });
});
