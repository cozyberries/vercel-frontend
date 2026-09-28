import { describe, it, expect } from "vitest";
import { isDelhiveryOrder } from "./utils";

describe("isDelhiveryOrder", () => {
  it("true when AWB present and carrier empty", () => {
    expect(isDelhiveryOrder(null, "12345")).toBe(true);
  });
  it("true when carrier contains delhivery, any case", () => {
    expect(isDelhiveryOrder("Delhivery Surface", "12345")).toBe(true);
  });
  it("false without an AWB", () => {
    expect(isDelhiveryOrder("Delhivery", null)).toBe(false);
    expect(isDelhiveryOrder("Delhivery", "  ")).toBe(false);
  });
  it("false for another carrier", () => {
    expect(isDelhiveryOrder("BlueDart", "12345")).toBe(false);
  });
});
