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

  it("stacks the brand on top, the product name under it, then the photo", () => {
    render(<Slide slide={slide} photoSrc="blob:a" />);
    const brand = screen.getByRole("heading", { level: 1, name: "CozyBerries" });
    const name = screen.getByRole("heading", { level: 2, name: slide.name });
    const photo = screen.getByAltText(slide.name);
    expect(brand.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(name.compareDocumentPosition(photo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("display-slide-stack").className).toMatch(/flex-col/);
  });

  it("sizes the photo to the largest square left under the text, not a fixed share of the screen", () => {
    render(<Slide slide={slide} photoSrc="blob:a" />);
    const area = screen.getByTestId("display-photo-area");
    expect(area.className).toMatch(/flex-1/);
    expect(area.className).toMatch(/\[container-type:size\]/);
    // Portrait: no taller than it is wide, so the text is not left stranded above an empty band.
    expect(area.className).toMatch(/max-h-\[calc\(100vw-6vmin\)\]/);
    const frame = screen.getByAltText(slide.name).parentElement!;
    expect(frame.className).toMatch(/w-\[min\(100cqw,100cqh\)\]/);
    expect(frame.className).toMatch(/h-\[min\(100cqw,100cqh\)\]/);
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
