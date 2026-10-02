import { describe, expect, it } from "vitest";
import { whatsappLink } from "./whatsapp";

describe("whatsappLink", () => {
  it.each([["+919876543210"], ["919876543210"], ["98765 43210"], ["9876543210"]])(
    "normalises %j to the Indian mobile",
    (phone) => {
      expect(whatsappLink(phone, "Hi & bye")).toBe(
        "https://api.whatsapp.com/send?phone=919876543210&text=Hi%20%26%20bye"
      );
    }
  );

  it.each([["12345"], [""], [null], [undefined]])("gives no link for %j", (phone) => {
    expect(whatsappLink(phone as string | null | undefined, "x")).toBeNull();
  });

  // wa.me's redirect to api.whatsapp.com replaces every emoji with U+FFFD, so the
  // customer saw "Hi Asha! �" (2026-10-02). The link must skip that redirect.
  it("never goes through wa.me, which turns emojis into �", () => {
    expect(whatsappLink("9876543210", "Hi 👋")).not.toContain("wa.me");
  });

  it("carries emojis and line breaks to WhatsApp unchanged", () => {
    const text = "Hi Asha! 👋\nThanks 💛\n🛍️ Shop online\n✉️ mail";
    const link = new URL(whatsappLink("9876543210", text)!);
    expect(link.origin + link.pathname).toBe("https://api.whatsapp.com/send");
    expect(link.searchParams.get("phone")).toBe("919876543210");
    expect(link.searchParams.get("text")).toBe(text);
  });
});
