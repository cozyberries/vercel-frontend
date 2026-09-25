import { describe, expect, it } from "vitest";
import { gstStateName, resolveGstStateCode } from "./state-codes";

describe("resolveGstStateCode", () => {
  it.each([
    ["Karnataka", "29"],
    ["KA", "29"],
    ["tamilnadu", "33"],
    ["Tamil Nadu ", "33"],
    ["Delhi", "07"],
    ["New Delhi", "07"],
    ["Orissa", "21"],
    ["Telangana", "36"],
    ["Jammu & Kashmir", "01"],
  ])("resolves %j to %s", (input, code) => {
    expect(resolveGstStateCode(input)).toBe(code);
  });

  it.each([["test"], [""], [null], [undefined]])("returns null for %j", (input) => {
    expect(resolveGstStateCode(input as string | null | undefined)).toBeNull();
  });
});

describe("gstStateName", () => {
  it("names a known code", () => expect(gstStateName("29")).toBe("Karnataka"));
  it("returns null for an unknown code", () => expect(gstStateName("98")).toBeNull());
});
