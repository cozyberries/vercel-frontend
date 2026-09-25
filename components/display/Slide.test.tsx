// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DisplaySlide } from "@/lib/display/slides";

// Controllable early-bird offer: getActiveOffer() reads these fields on every call.
const offer = vi.hoisted(() => ({
  value: {
    code: "TEST",
    discountRate: 0.1,
    expiresAt: new Date("2099-01-01T00:00:00Z"),
    enabled: false,
    label: "Test Offer",
    badgeText: "10% OFF",
  },
}));
vi.mock("@/lib/config/offers", () => ({ EARLY_BIRD_OFFER: offer.value }));

import EmptySlide from "./EmptySlide";
import Slide from "./Slide";

const slide: DisplaySlide = {
  slug: "a",
  name: "Lilac Blossom – Boys Co-ord Set",
  minPrice: 450,
  hasRange: false,
  photoUrl: "https://img/a_detail.webp",
  fallbackUrl: "https://img/a.jpg",
  productUrl: "https://cozyberries.in/products/a?utm_source=stall&utm_medium=display",
};

afterEach(() => {
  offer.value.enabled = false;
});

describe("Slide", () => {
  it("shows the photo as backdrop and frame, the name and the scan prompt", () => {
    render(<Slide slide={slide} photoSrc="blob:a" />);
    expect(screen.getByAltText(slide.name)).toHaveAttribute("src", "blob:a");
    expect(document.querySelectorAll('img[src="blob:a"]')).toHaveLength(2);
    expect(screen.getByRole("heading", { name: slide.name })).toBeInTheDocument();
    expect(screen.getByText(/Scan to order/)).toBeInTheDocument();
    expect(screen.getByText(/Pick up at the stall/)).toBeInTheDocument();
  });

  it("renders a real QR code for the product link", async () => {
    render(<Slide slide={slide} photoSrc="blob:a" />);
    const qr = screen.getByRole("img", { name: "QR code" });
    expect(qr).toHaveAttribute("data-qr-value", slide.productUrl);
    await waitFor(() => expect(qr.querySelector("svg")).not.toBeNull());
  });

  it("prices like the product card: plain price, Starts at for ranges", () => {
    const { rerender } = render(<Slide slide={slide} photoSrc="blob:a" />);
    expect(screen.getByText("₹450")).toBeInTheDocument();
    expect(screen.queryByText("Starts at")).not.toBeInTheDocument();
    rerender(<Slide slide={{ ...slide, hasRange: true }} photoSrc="blob:a" />);
    expect(screen.getByText("Starts at")).toBeInTheDocument();
  });

  it("shows MRP, the discounted price and the badge while an offer runs", () => {
    offer.value.enabled = true;
    render(<Slide slide={slide} photoSrc="blob:a" />);
    expect(screen.getByText("₹450")).toBeInTheDocument();
    expect(screen.getByText("₹405")).toBeInTheDocument();
    expect(screen.getByText("10% OFF")).toBeInTheDocument();
  });
});

describe("EmptySlide", () => {
  it("offers a Scan to shop QR code for the homepage", () => {
    render(<EmptySlide />);
    expect(screen.getByText("Scan to shop")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "QR code" }).getAttribute("data-qr-value")).toMatch(
      /\/\?utm_source=stall&utm_medium=display$/,
    );
  });
});
