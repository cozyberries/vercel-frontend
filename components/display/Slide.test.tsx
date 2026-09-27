// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DisplaySlide } from "@/lib/display/slides";

// Controllable early-bird offer and MRP display: both are read on every call.
const offer = vi.hoisted(() => ({
  value: {
    code: "TEST",
    discountRate: 0.1,
    expiresAt: new Date("2099-01-01T00:00:00Z"),
    enabled: false,
    label: "Test Offer",
    badgeText: "10% OFF",
  },
  mrp: { discountRate: 0.1, shownSince: new Date("2026-09-27T00:00:00+05:30") },
}));
vi.mock("@/lib/config/offers", () => ({ EARLY_BIRD_OFFER: offer.value, MRP_DISPLAY: offer.mrp }));

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
  offer.mrp.discountRate = 0.1;
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
    offer.mrp.discountRate = 0;
    const { rerender } = render(<Slide slide={slide} photoSrc="blob:a" />);
    expect(screen.getByText("₹450")).toBeInTheDocument();
    expect(screen.queryByText("Starts at")).not.toBeInTheDocument();
    rerender(<Slide slide={{ ...slide, hasRange: true }} photoSrc="blob:a" />);
    expect(screen.getByText("Starts at")).toBeInTheDocument();
  });

  it("shows the MRP struck through, the price charged and 10% OFF", () => {
    render(<Slide slide={slide} photoSrc="blob:a" />);
    expect(screen.getByText("₹500").className).toMatch(/line-through/);
    expect(screen.getByText("₹450")).toBeInTheDocument();
    expect(screen.getByText("10% OFF")).toBeInTheDocument();
  });

  it("shows MRP, the discounted price and the badge while an offer runs", () => {
    offer.mrp.discountRate = 0;
    offer.value.enabled = true;
    render(<Slide slide={slide} photoSrc="blob:a" />);
    expect(screen.getByText("₹450")).toBeInTheDocument();
    expect(screen.getByText("₹405")).toBeInTheDocument();
    expect(screen.getByText("10% OFF")).toBeInTheDocument();
  });
});

describe("Slide price on a TV", () => {
  it("sizes every part of the price to read across a room", () => {
    render(<Slide slide={{ ...slide, hasRange: true }} photoSrc="blob:a" />);
    for (const text of ["Starts at", "₹500", "₹450", "10% OFF"]) {
      expect(screen.getByText(text).className).toMatch(/vmin/);
    }
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
