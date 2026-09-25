import { describe, expect, it } from "vitest";
import { whatsappLink } from "./whatsapp";

describe("whatsappLink", () => {
  it.each([["+919876543210"], ["919876543210"], ["98765 43210"], ["9876543210"]])(
    "normalises %j to the Indian mobile",
    (phone) => {
      expect(whatsappLink(phone, "Hi & bye")).toBe("https://wa.me/919876543210?text=Hi%20%26%20bye");
    }
  );

  it.each([["12345"], [""], [null], [undefined]])("gives no link for %j", (phone) => {
    expect(whatsappLink(phone as string | null | undefined, "x")).toBeNull();
  });
});
