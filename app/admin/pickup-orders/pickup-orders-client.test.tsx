// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const respond = (body: unknown) =>
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => body }));

describe("pickup orders card", () => {
  it("shows each line's price so staff can check it against the bill", async () => {
    render(<PickupOrdersClient />);
    expect(await screen.findByText(lineText("2 × Frock · 3-4Y · Pink — ₹1000"))).toBeInTheDocument();
    expect(screen.getByText(lineText("1 × Romper — ₹300"))).toBeInTheDocument();
  });

  it("an order waiting for the owner's ✅ says so and cannot be handed over", async () => {
    respond({
      orders: [{ ...order, status: "verifying_payment", invoice_number: null, payments: [{ payment_method: "cash", status: "processing" }] }],
      awaiting_count: 1,
    });
    render(<PickupOrdersClient />);
    expect(await screen.findByText("Waiting for the owner's ✅ on Telegram")).toBeInTheDocument();
    expect(screen.getByText(/₹1300 · Cash recorded/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mark collected/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mark ready/ })).not.toBeInTheDocument();
  });
});

describe("awaiting tab", () => {
  it("shows how many orders are waiting for ✅", async () => {
    respond({ orders: [order], awaiting_count: 2 });
    render(<PickupOrdersClient />);
    const tab = await screen.findByRole("tab", { name: /Awaiting/ });
    expect(tab).toHaveTextContent("2");
  });

  it("loads the unpaid pickup orders when opened", async () => {
    respond({ orders: [], awaiting_count: 0 });
    render(<PickupOrdersClient />);
    fireEvent.click(await screen.findByRole("tab", { name: /Awaiting ✅/ }));
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.map((c) => String(c[0]))).toContain("/api/admin/pickup-orders?tab=awaiting")
    );
  });

  it("opens the tab named in the URL", async () => {
    window.history.replaceState({}, "", "/admin/pickup-orders?tab=ready");
    render(<PickupOrdersClient />);
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.map((c) => String(c[0]))).toContain("/api/admin/pickup-orders?tab=ready")
    );
    window.history.replaceState({}, "", "/admin/pickup-orders");
  });

  it("falls back to the handover tab for an unknown ?tab= value", async () => {
    window.history.replaceState({}, "", "/admin/pickup-orders?tab=bogus");
    render(<PickupOrdersClient />);
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.map((c) => String(c[0]))).toContain("/api/admin/pickup-orders?tab=handover")
    );
    window.history.replaceState({}, "", "/admin/pickup-orders");
  });
});

describe("search", () => {
  it("hides the tab row and searches by q when typing", async () => {
    respond({ orders: [order], awaiting_count: 1 });
    render(<PickupOrdersClient />);
    await screen.findByRole("tab", { name: /Awaiting/ });
    fireEvent.change(screen.getByPlaceholderText("Search by phone or order number"), {
      target: { value: "9876543210" },
    });
    await waitFor(() => expect(screen.queryByRole("tablist")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.map((c) => String(c[0]))).toContain(
        "/api/admin/pickup-orders?tab=handover&q=9876543210"
      )
    );
  });
});

describe("ready_for_pickup order", () => {
  it("shows Send ready message and Mark collected but not Mark ready", async () => {
    respond({
      orders: [{ ...order, status: "ready_for_pickup" }],
      awaiting_count: 0,
    });
    render(<PickupOrdersClient />);
    expect(await screen.findByRole("link", { name: /Send ready message/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mark collected/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mark ready/ })).not.toBeInTheDocument();
  });
});

describe("empty state", () => {
  it("renders when there are no orders for the tab", async () => {
    respond({ orders: [], awaiting_count: 0 });
    render(<PickupOrdersClient />);
    expect(await screen.findByText("No pickup orders here")).toBeInTheDocument();
  });
});
