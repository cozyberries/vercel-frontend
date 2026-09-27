import { describe, expect, it } from "vitest";
import { isAdminApiRequest, isBillRequest, isDisplayNavigation } from "./matchers";

const ORIGIN = "https://cozyberries.in";
const at = (path: string, mode: RequestMode = "navigate") => {
  const url = new URL(path, ORIGIN);
  return { request: { mode }, url, sameOrigin: url.origin === ORIGIN };
};

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

describe("isBillRequest", () => {
  it("matches public bill links, which must never be cached on the device", () => {
    expect(isBillRequest(at("/bill/3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c/abc"))).toBe(true);
    expect(isBillRequest(at("/bill/x/y", "cors"))).toBe(true);
  });

  it("ignores other paths", () => {
    expect(isBillRequest(at("/billing"))).toBe(false);
    expect(isBillRequest(at("/orders/1/invoice"))).toBe(false);
  });
});

describe("isAdminApiRequest", () => {
  it("matches any same-origin /api/admin/ path, any method", () => {
    expect(isAdminApiRequest(at("/api/admin/stall-refills"))).toBe(true);
    expect(
      isAdminApiRequest(at("/api/admin/stall-refills/3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c", "cors")),
    ).toBe(true);
    expect(isAdminApiRequest(at("/api/admin/pickup-orders", "cors"))).toBe(true);
  });

  it("ignores non-admin and cross-origin paths", () => {
    expect(isAdminApiRequest(at("/api/administrator"))).toBe(false);
    expect(isAdminApiRequest(at("/api/catalog"))).toBe(false);
    const crossOrigin = new URL("https://evil.example/api/admin/stall-refills");
    expect(
      isAdminApiRequest({ request: { mode: "cors" }, url: crossOrigin, sameOrigin: false }),
    ).toBe(false);
  });
});
