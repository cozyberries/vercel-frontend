// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DisplaySlide } from "@/lib/display/slides";
import EmptySlide from "./EmptySlide";
import Slide from "./Slide";

const slide: DisplaySlide = {
  slug: "a",
  name: "Lilac Blossom – Boys Co-ord Set",
  photoUrl: "https://img/a_detail.webp",
  fallbackUrl: "https://img/a.jpg",
};

describe("Slide", () => {
  it("shows the photo as backdrop and frame, and the name", () => {
    render(<Slide slide={slide} photoSrc="blob:a" />);
    expect(screen.getByAltText(slide.name)).toHaveAttribute("src", "blob:a");
    expect(document.querySelectorAll('img[src="blob:a"]')).toHaveLength(2);
    expect(screen.getByRole("heading", { name: slide.name })).toBeInTheDocument();
  });

  it("shows no price and no QR code", () => {
    render(<Slide slide={slide} photoSrc="blob:a" />);
    expect(screen.queryByText(/₹/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Starts at|OFF/)).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "QR code" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Scan to order|Pick up at the stall/)).not.toBeInTheDocument();
  });
});

describe("EmptySlide", () => {
  it("shows the brand line and no QR code", () => {
    render(<EmptySlide />);
    expect(screen.getByRole("heading", { name: "Soft muslin for little ones" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "QR code" })).not.toBeInTheDocument();
    expect(screen.queryByText("Scan to shop")).not.toBeInTheDocument();
  });
});
