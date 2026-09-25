import { afterEach, describe, expect, it, vi } from "vitest";
import { getBusinessGstin, getHomeStateCode } from "./gstin";

afterEach(() => vi.unstubAllEnvs());

describe("getBusinessGstin", () => {
  it("throws when the variable is missing", () => {
    vi.stubEnv("BUSINESS_GSTIN", "");
    expect(() => getBusinessGstin()).toThrow("BUSINESS_GSTIN is not set");
  });
  it("throws when the value is not a GSTIN", () => {
    vi.stubEnv("BUSINESS_GSTIN", "29EPDPR9174E1Z");
    expect(() => getBusinessGstin()).toThrow("not a valid 15-character GSTIN");
  });
  it("normalises case and whitespace", () => {
    vi.stubEnv("BUSINESS_GSTIN", "  29epdpr9174e1zb ");
    expect(getBusinessGstin()).toBe("29EPDPR9174E1ZB");
  });
  it("derives the home state from the first two digits", () => {
    vi.stubEnv("BUSINESS_GSTIN", "29EPDPR9174E1ZB");
    expect(getHomeStateCode()).toBe("29");
  });
});
