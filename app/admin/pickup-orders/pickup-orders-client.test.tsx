// @vitest-environment jsdom
import { useLayoutEffect } from "react";
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
    // The tab renders before its badge count arrives from the load() fetch
    // (a setTimeout(0)); poll instead of asserting the instant findByRole resolves.
    await waitFor(() => expect(tab).toHaveTextContent("2"));
  });

  it("loads the unpaid pickup orders when opened", async () => {
    respond({ orders: [], awaiting_count: 0 });
    render(<PickupOrdersClient />);
    fireEvent.click(await screen.findByRole("tab", { name: /Awaiting ✅/ }));
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.map((c) => String(c[0]))).toContain("/api/admin/pickup-orders?tab=awaiting")
    );
  });

  const fetchedUrls = () => vi.mocked(fetch).mock.calls.map((c) => String(c[0]));

  it("opens the tab named in the URL, and its first fetch is that tab", async () => {
    window.history.replaceState({}, "", "/admin/pickup-orders?tab=ready");
    render(<PickupOrdersClient />);
    await waitFor(() => expect(fetchedUrls().length).toBeGreaterThan(0));
    expect(fetchedUrls()[0]).toBe("/api/admin/pickup-orders?tab=ready");
    expect(fetchedUrls()).not.toContain("/api/admin/pickup-orders?tab=handover");
    expect(screen.getByRole("tab", { name: "Ready" })).toHaveAttribute("aria-selected", "true");
    window.history.replaceState({}, "", "/admin/pickup-orders");
  });

  it("reads ?tab= after the router updates the URL (client-side link click)", async () => {
    // Next's router pushes the new URL in an effect after the page has rendered.
    // Simulate that: the URL is /admin while rendering, ?tab=ready once effects run.
    window.history.replaceState({}, "", "/admin");
    function RouterPush() {
      useLayoutEffect(() => {
        window.history.replaceState({}, "", "/admin/pickup-orders?tab=ready");
      }, []);
      return null;
    }
    render(
      <>
        <RouterPush />
        <PickupOrdersClient />
      </>
    );
    await waitFor(() => expect(fetchedUrls().length).toBeGreaterThan(0));
    expect(fetchedUrls()[0]).toBe("/api/admin/pickup-orders?tab=ready");
    expect(fetchedUrls()).not.toContain("/api/admin/pickup-orders?tab=handover");
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

describe("load errors (spec §5)", () => {
  const fail = (status: number, error: string) => ({ ok: false, status, json: async () => ({ error }) });

  it("a failed first load shows the banner with Retry, not the empty state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fail(500, "Database unavailable"))
      .mockResolvedValue({ ok: true, json: async () => ({ orders: [order], awaiting_count: 0 }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<PickupOrdersClient />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Database unavailable");
    expect(screen.queryByText("No pickup orders here")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Log in again" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(lineText("1 × Romper — ₹300"))).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a 401 shows Log in again back to this page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fail(401, "Unauthorized")));
    render(<PickupOrdersClient />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unauthorized");
    expect(screen.getByRole("link", { name: "Log in again" })).toHaveAttribute(
      "href",
      "/login?redirect=%2Fadmin%2Fpickup-orders"
    );
    expect(screen.queryByText("No pickup orders here")).not.toBeInTheDocument();
  });

  it("a failed refresh keeps the previous rows visible under the banner", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return { ok: true, json: async () => ({}) };
      // First list load succeeds; the refresh after the PATCH fails.
      return fetchMock.mock.calls.filter(([, i]) => !i || (i as RequestInit).method !== "PATCH").length === 1
        ? { ok: true, json: async () => ({ orders: [order], awaiting_count: 0 }) }
        : fail(503, "Network error");
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PickupOrdersClient />);
    fireEvent.click(await screen.findByRole("button", { name: /Mark collected/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Network error");
    expect(screen.getByText(lineText("2 × Frock · 3-4Y · Pink — ₹1000"))).toBeInTheDocument();
    expect(screen.getByTestId("pickup-order-1")).toBeInTheDocument();
  });
});
