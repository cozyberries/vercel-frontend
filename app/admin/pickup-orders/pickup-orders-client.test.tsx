// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import PickupOrdersClient from "./pickup-orders-client";

const order = {
  id: "order-1",
  order_number: "ORD-1",
  status: "processing",
  customer_name: "Asha",
  customer_phone: "9876543210",
  total_amount: 1300,
  invoice_number: "CB/26-27/0001",
  created_at: "2026-09-25T06:00:00.000Z",
  updated_at: "2026-09-25T06:00:00.000Z",
  order_items: [
    { name: "Frock", size: "3-4Y", color: "Pink", quantity: 2, price: 500 },
    { name: "Romper", size: null, color: null, quantity: 1, price: 300 },
  ],
  payments: [{ payment_method: "cash", status: "completed" }],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ orders: [order] }) }));
});
afterEach(() => vi.unstubAllGlobals());

const lineText = (text: string) => (_: string, el: Element | null) =>
  el?.tagName === "LI" && el.textContent === text;

describe("pickup orders card", () => {
  it("shows each line's price so staff can check it against the bill", async () => {
    render(<PickupOrdersClient />);
    expect(await screen.findByText(lineText("2 × Frock · 3-4Y · Pink — ₹1000"))).toBeInTheDocument();
    expect(screen.getByText(lineText("1 × Romper — ₹300"))).toBeInTheDocument();
  });
});
