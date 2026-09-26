import { describe, expect, it } from "vitest";
import { HSN_BABY_GARMENTS, SELLER, STALL } from "./business";
import { resolveGstStateCode } from "@/lib/invoice/state-codes";

const ownerValues = [
  STALL.name,
  ...STALL.addressLines,
  STALL.hours,
  STALL.mapUrl,
  SELLER.legalName,
  ...SELLER.addressLines,
  SELLER.stateName,
];

describe("business config", () => {
  it("has every owner-supplied value filled in", () => {
    for (const value of ownerValues) {
      expect(value.trim()).not.toBe("");
      expect(value).not.toMatch(/<owner:/i);
    }
  });
  it("links the stall map over https", () => {
    expect(STALL.mapUrl).toMatch(/^https:\/\//);
  });
  it("keeps the seller state code consistent with its name (GSTIN prefix 29)", () => {
    expect(SELLER.stateCode).toBe("29");
    expect(resolveGstStateCode(SELLER.stateName)).toBe(SELLER.stateCode);
  });
  it("uses HSN 6111 for baby garments", () => {
    expect(HSN_BABY_GARMENTS).toBe("6111");
  });
});
