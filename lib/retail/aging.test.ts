import { describe, expect, it } from "vitest";
import { ageBand, invoiceDeadline } from "./aging";

describe("six-month rule", () => {
  it("sets the deadline six months after the batch was sent", () => {
    expect(invoiceDeadline("2026-04-15")).toBe("2026-10-15");
  });
  it("is ok until five months, amber from five, red from six", () => {
    expect(ageBand("2026-04-15", "2026-09-14")).toBe("ok");
    expect(ageBand("2026-04-15", "2026-09-15")).toBe("amber");
    expect(ageBand("2026-04-15", "2026-10-14")).toBe("amber");
    expect(ageBand("2026-04-15", "2026-10-15")).toBe("red");
  });
});
