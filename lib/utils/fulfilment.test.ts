import { describe, expect, it } from "vitest";
import { canContinueCheckout, deliveryChargeFor, parseFulfilmentMethod } from "./fulfilment";

describe("parseFulfilmentMethod", () => {
  it("treats a missing value as delivery (clients that predate pickup)", () => {
    expect(parseFulfilmentMethod(undefined)).toBe("delivery");
    expect(parseFulfilmentMethod(null)).toBe("delivery");
  });
  it("accepts the two methods", () => {
    expect(parseFulfilmentMethod("delivery")).toBe("delivery");
    expect(parseFulfilmentMethod("pickup")).toBe("pickup");
  });
  it("rejects anything else", () => {
    expect(parseFulfilmentMethod("drone")).toBeNull();
    expect(parseFulfilmentMethod("PICKUP")).toBeNull();
    expect(parseFulfilmentMethod(1)).toBeNull();
  });
});

describe("deliveryChargeFor", () => {
  it("never charges for pickup", () => {
    expect(deliveryChargeFor(100, "pickup", 1)).toBe(0);
    expect(deliveryChargeFor(5000, "pickup", 3)).toBe(0);
  });
  it("charges ₹90 below ₹1,999 for delivery", () => {
    expect(deliveryChargeFor(1998, "delivery", 1)).toBe(90);
  });
  it("is free from ₹1,999 for delivery", () => {
    expect(deliveryChargeFor(1999, "delivery", 1)).toBe(0);
  });
  it("is zero for an empty cart", () => {
    expect(deliveryChargeFor(0, "delivery", 0)).toBe(0);
  });
});

describe("canContinueCheckout", () => {
  it("needs an address for delivery", () => {
    expect(canContinueCheckout({ fulfilment: "delivery", selectedAddressId: null })).toBe(false);
    expect(canContinueCheckout({ fulfilment: "delivery", selectedAddressId: "a1" })).toBe(true);
  });
  it("never needs an address for pickup", () => {
    expect(canContinueCheckout({ fulfilment: "pickup", selectedAddressId: null })).toBe(true);
  });
});
