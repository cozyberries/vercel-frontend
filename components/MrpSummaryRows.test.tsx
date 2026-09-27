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

import MrpSummaryRows from "./MrpSummaryRows";

const items = [
  { price: 450, quantity: 2 },
  { price: 599, quantity: 1 },
];

afterEach(() => {
  cfg.mrp.discountRate = 0.1;
});

function row(label: string) {
  return screen.getByText(label).parentElement?.textContent;
}

describe("MrpSummaryRows", () => {
  it("lists the MRP total and the discount on MRP", () => {
    render(<MrpSummaryRows items={items} />);
    expect(row("Total MRP")).toBe("Total MRP₹1666");
    expect(row("Discount on MRP")).toBe("Discount on MRP−₹167");
  });

  it("shows nothing on an order placed before the MRP was shown", () => {
    const { container } = render(<MrpSummaryRows items={items} placedAt="2026-09-20T10:00:00Z" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the rows on an order placed once the MRP was shown", () => {
    render(<MrpSummaryRows items={items} placedAt="2026-09-28T10:00:00Z" />);
    expect(row("Discount on MRP")).toBe("Discount on MRP−₹167");
  });

  it("shows nothing while the MRP display is off", () => {
    cfg.mrp.discountRate = 0;
    const { container } = render(<MrpSummaryRows items={items} />);
    expect(container).toBeEmptyDOMElement();
  });
});
