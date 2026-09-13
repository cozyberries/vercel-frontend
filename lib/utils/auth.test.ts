import { describe, expect, it } from "vitest";
import { isPlaceholderEmail } from "./auth";

describe("isPlaceholderEmail", () => {
  it("recognises the current and transitional phone placeholder domains", () => {
    expect(isPlaceholderEmail("9876543210@phone.cozyberries.local")).toBe(true);
    expect(isPlaceholderEmail("9876543210@phone.cozyberries.in")).toBe(true);
  });

  it("treats real emails, empty values and the retired misspelled domain as non-placeholders", () => {
    expect(isPlaceholderEmail("someone@example.com")).toBe(false);
    expect(isPlaceholderEmail("")).toBe(false);
    expect(isPlaceholderEmail(null)).toBe(false);
    expect(isPlaceholderEmail(undefined)).toBe(false);
    expect(isPlaceholderEmail("phone+919876543210@phone.cozyburry.local")).toBe(false);
  });
});
