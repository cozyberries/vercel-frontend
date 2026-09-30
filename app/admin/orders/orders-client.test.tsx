// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OrdersClient, { filtersFromLocation } from "./orders-client";
import { matchesSearch, type AdminOrder } from "./api";

const order: AdminOrder = {
  id: "o-1",
  order_number: "ORD-20260928-120000-00001",
  user_id: "u-1",
  status: "processing",
  fulfilment_method: "delivery",
  total_amount: 999,
  created_at: "2026-09-28T10:00:00Z",
  tracking_number: "WB1",
  carrier_name: "Delhivery",
  shipping_address: { full_name: "Asha", phone: "8888888888" },
  items: [{ sku: "frock-red-2-3y", quantity: 1 }],
  payments: [],
  bill_url: null,
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      const body = u.includes("/api/admin/notifications")
        ? { notifications: [], unread: 0 }
        : { orders: [order], total: 1 };
      return new Response(JSON.stringify(body), { status: 200 });
    })
  );
});

function renderClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <OrdersClient />
    </QueryClientProvider>
  );
}

describe("OrdersClient", () => {
  it("renders fetched orders", async () => {
    renderClient();
    expect(await screen.findByText(/ORD-20260928-120000-00001/)).toBeInTheDocument();
    expect(screen.getByText(/Asha/)).toBeInTheDocument();
  });

  it("seeds the filters from the URL on mount", async () => {
    window.history.replaceState({}, "", "/admin/orders?fulfilment=delivery&status=processing&days=30");
    renderClient();
    // Match on the /api/admin/orders call specifically (not call index 0):
    // NotificationsPanel fires its own unrelated fetch as a mounted child, and
    // React always flushes a child's effects before its parent's own effects,
    // so the notifications request can land in fetch-mock-call-order ahead of
    // the seeded orders request regardless of render structure. Asserting on
    // the matching URL keeps this test about the actual behaviour (URL params
    // reach the orders API call) rather than incidental component order.
    const findOrdersCall = () =>
      vi.mocked(fetch).mock.calls.map((c) => String(c[0])).find((u) => u.includes("/api/admin/orders"));
    await waitFor(() => expect(findOrdersCall()).toContain("status=processing"));
    expect(findOrdersCall()).toContain("fulfilment=delivery");
    expect(within(screen.getByRole("radiogroup", { name: "Date range" })).getByRole("radio", { name: "30d" })).toHaveAttribute("aria-checked", "true");
    window.history.replaceState({}, "", "/admin/orders");
  });

  it("shows the empty state when the API returns no orders", async () => {
    vi.mocked(fetch).mockImplementation(async (url: RequestInfo | URL) => {
      const u = String(url);
      const body = u.includes("/api/admin/notifications")
        ? { notifications: [], unread: 0 }
        : { orders: [], total: 0 };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    renderClient();
    expect(await screen.findByText("No orders match")).toBeInTheDocument();
  });

  it("hides the pagination row when total is within one page", async () => {
    renderClient();
    await screen.findByText(/ORD-20260928-120000-00001/);
    expect(screen.queryByText("Previous")).not.toBeInTheDocument();
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
  });
});

describe("filtersFromLocation", () => {
  it("falls back to 'all' for an unknown status and 7 for an unknown days value", () => {
    window.history.replaceState({}, "", "/admin/orders?status=bogus-status&days=15");
    expect(filtersFromLocation()).toEqual({ status: "all", fulfilment: "all", days: 7, offset: 0 });
    window.history.replaceState({}, "", "/admin/orders");
  });
});

describe("matchesSearch", () => {
  it("matches order number, AWB, name, phone; empty query matches all", () => {
    expect(matchesSearch(order, "")).toBe(true);
    expect(matchesSearch(order, "wb1")).toBe(true);
    expect(matchesSearch(order, "asha")).toBe(true);
    expect(matchesSearch(order, "8888")).toBe(true);
    expect(matchesSearch(order, "nope")).toBe(false);
  });
});
