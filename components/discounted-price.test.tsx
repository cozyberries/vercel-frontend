// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const cfg = vi.hoisted(() => ({
  offer: {
    code: "EARLY5",
    discountRate: 0.05,
    expiresAt: new Date("2099-01-01T00:00:00Z"),
    enabled: false,
    label: "Early Bird Offer",
    badgeText: "5% OFF",
  },
  mrp: { discountRate: 0.1, shownSince: new Date("2026-09-27T00:00:00+05:30") },
}));
vi.mock("@/lib/config/offers", () => ({ EARLY_BIRD_OFFER: cfg.offer, MRP_DISPLAY: cfg.mrp }));

import DiscountedPrice from "./discounted-price";

afterEach(() => {
  cfg.mrp.discountRate = 0.1;
});

describe("DiscountedPrice", () => {
  it.each(["default", "hero"] as const)("shows the MRP struck through, the price charged and the badge (%s)", (variant) => {
    render(<DiscountedPrice price={450} variant={variant} />);
    expect(screen.getByText("₹500").className).toMatch(/line-through/);
    expect(screen.getByText("₹450").className).not.toMatch(/line-through/);
    expect(screen.getByText("10% OFF")).toBeInTheDocument();
  });

  it("shows only the price when the MRP display is off", () => {
    cfg.mrp.discountRate = 0;
    render(<DiscountedPrice price={450} />);
    expect(screen.getByText("₹450")).toBeInTheDocument();
    expect(screen.queryByText(/OFF/)).not.toBeInTheDocument();
    expect(document.querySelector(".line-through")).toBeNull();
  });
});
