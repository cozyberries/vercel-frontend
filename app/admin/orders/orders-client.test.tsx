// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OrdersClient from "./orders-client";
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
