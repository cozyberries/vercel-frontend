import { describe, expect, it } from "vitest";
import { gstinCheckChar, validateGstin } from "./gstin";

describe("validateGstin", () => {
  it("accepts a valid GSTIN, normalising spaces and case, and names the state", () => {
    expect(validateGstin(" 29aagfc4321m1zb ")).toEqual({ ok: true, gstin: "29AAGFC4321M1ZB", stateCode: "29", stateName: "Karnataka" });
    expect(validateGstin("33AAACR5055K1ZE")).toMatchObject({ ok: true, stateCode: "33", stateName: "Tamil Nadu" });
  });
  it("computes the published example's check character", () => {
    expect(gstinCheckChar("27AAPFU0939F1Z")).toBe("V");
  });
  it("refuses a wrong check character", () => {
    expect(validateGstin("29AAGFC4321M1ZC")).toEqual({ ok: false, error: "This GSTIN's last character doesn't match: check for a typo" });
  });
  it("refuses a bad shape, an unknown state and a blank", () => {
    expect(validateGstin("29AAGFC4321M1Z")).toMatchObject({ ok: false });
    expect(validateGstin("00AAGFC4321M1ZB")).toEqual({ ok: false, error: "00 is not a GST state code" });
    expect(validateGstin("")).toEqual({ ok: false, error: "Enter the shop's GSTIN" });
    expect(validateGstin(42)).toEqual({ ok: false, error: "Enter the shop's GSTIN" });
  });
});
