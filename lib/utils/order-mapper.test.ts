import { describe, expect, it } from "vitest";
import { toCustomerOrder } from "./order-mapper";

describe("toCustomerOrder", () => {
  it("removes the admin id", () => {
    expect(toCustomerOrder({ id: "o-1", placed_by_admin_id: "admin-1" })).toEqual({ id: "o-1" });
  });

  it("drops a leftover admin override line and keeps the customer's note", () => {
    const out = toCustomerOrder({
      id: "o-1",
      notes: "[ADMIN OVERRIDE by asha@cozyberries.in]: (+10% prices) Event price\nGift wrap please",
    });
    expect(out).toEqual({ id: "o-1", notes: "Gift wrap please" });
  });

  it("leaves no note when the override line was the whole note", () => {
    expect(toCustomerOrder({ id: "o-1", notes: "[ADMIN OVERRIDE by asha@cozyberries.in]" }).notes).toBeNull();
  });

  it("leaves an ordinary note alone", () => {
    expect(toCustomerOrder({ id: "o-1", notes: "Leave at the gate" }).notes).toBe("Leave at the gate");
  });

  it("hides the retired ADMIN_PRICE_UP code but keeps a real discount code", () => {
    expect(toCustomerOrder({ id: "o-1", discount_code: "ADMIN_PRICE_UP" }).discount_code).toBeNull();
    expect(toCustomerOrder({ id: "o-1", discount_code: "ADMIN_OVERRIDE" }).discount_code).toBe("ADMIN_OVERRIDE");
  });

  it("adds no fields to an order that has none of them", () => {
    expect(toCustomerOrder({ id: "o-1" })).toEqual({ id: "o-1" });
  });
});
